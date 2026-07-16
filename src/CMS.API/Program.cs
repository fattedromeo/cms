using CMS.API.Data;
using CMS.API.Middleware;
using CMS.API.Repositories;
using CMS.API.Services;
using Dapper;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicy = "LocalhostCors";

// Dapper type handlers. Course.ScheduleOn/ScheduleOff and FeaturedPromoItem.ScheduleOn are SQL
// `date` (the latter also drives the week grid's range filter), and neither Dapper 2.1.79
// nor Microsoft.Data.SqlClient 7.0.2 maps DateOnly natively (reads throw DataException, parameters
// throw NotSupportedException) — so this registration is required, not defensive. It covers both
// DateOnly and DateOnly? (the nullable date-range query filters).
SqlMapper.AddTypeHandler(new DateOnlyTypeHandler());

// --- Services ---------------------------------------------------------------
builder.Services.AddControllers();

// Swagger / OpenAPI (Swashbuckle)
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "CMS API",
        Version = "v1",
        Description = "CMS backend Web API (Dapper, .NET 9)."
    });

    // Everything except /api/auth/login needs a bearer token, so Swagger UI needs somewhere to put
    // one — otherwise every "Try it out" in the dev console returns 401 with no way to fix it.
    const string BearerScheme = "Bearer";
    options.AddSecurityDefinition(BearerScheme, new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Paste the accessToken from POST /api/auth/login (no \"Bearer \" prefix)."
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        [new OpenApiSecurityScheme
        {
            Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = BearerScheme }
        }] = Array.Empty<string>()
    });
});

// CORS for the Angular dev server(s) on localhost.
builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
        policy.SetIsOriginAllowed(origin => new Uri(origin).IsLoopback)
              .AllowAnyHeader()
              .AllowAnyMethod());
});

// Data access
builder.Services.AddSingleton<IDbConnectionFactory, SqlConnectionFactory>();
builder.Services.AddScoped<IAppRoleRepository, AppRoleRepository>();
builder.Services.AddScoped<IAppUserRepository, AppUserRepository>();
// The only repository that reads AppUser.PasswordHash — kept apart from IAppUserRepository, whose
// contract is that the hash is never selected. Feeds AuthController's credential check only.
builder.Services.AddScoped<IAuthRepository, AuthRepository>();
// Server-side only: reads SysConfig['appConfig'].defaultPassword and .symmetricSecurityKey (the JWT
// signing secret). Never exposed via a controller.
builder.Services.AddScoped<ISysConfigRepository, SysConfigRepository>();
builder.Services.AddScoped<IPublishStatusRepository, PublishStatusRepository>();
builder.Services.AddScoped<IPartnerRepository, PartnerRepository>();
builder.Services.AddScoped<ICourseGroupRepository, CourseGroupRepository>();
builder.Services.AddScoped<ICourseRepository, CourseRepository>();
builder.Services.AddScoped<IFeaturedPromoItemRepository, FeaturedPromoItemRepository>();
builder.Services.AddScoped<ILookupRepository, LookupRepository>();

// Cross-cutting row audit: one RowAudit row per business-table Insert/Update/Delete. Repositories
// will call it after their write (wired per-repository in a later step — nothing calls it yet).
// IHttpContextAccessor lets it stamp the acting user's name from the request JWT.
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IRowAuditWriter, RowAuditWriter>();
// Read side of RowAudit — one record's history for the 異動紀錄 badge (RowAuditController).
builder.Services.AddScoped<IRowAuditRepository, RowAuditRepository>();

// --- Authentication / authorization -----------------------------------------
// Single owner of the SysConfig signing key, shared by issuance and validation, so the two cannot
// drift apart. Singleton: JwtBearerOptions are singletons, and the key is cached across requests.
builder.Services.AddSingleton<ISigningKeyProvider, SigningKeyProvider>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer();

// Configured separately so the singleton ISigningKeyProvider can be injected rather than captured
// out of a half-built container.
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<ISigningKeyProvider>((options, keys) =>
    {
        // ⚠️ Defaults to TRUE, which silently rewrites inbound claim types through the legacy
        // JwtSecurityTokenHandler map: "role" becomes the ClaimTypes.Role schema URI and "name"
        // becomes ClaimTypes.Name. RoleClaimType below would then match nothing and
        // [Authorize(Roles = "Admin")] would 403 every user — a real Admin included. Turning the
        // mapping off keeps the claims exactly as JwtTokenService emitted them.
        // (Caught by AuthorizationIntegrationTests.AdminEndpoint_WithAdminRole_Returns200, which
        // failed with 403 before this line existed.)
        options.MapInboundClaims = false;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            // Resolved per validation rather than pinned once, so a rotated SysConfig row takes
            // effect within the provider's cache TTL instead of needing a redeploy.
            IssuerSigningKeyResolver = (_, _, _, _) => [keys.Get()],
            ValidateLifetime = true,
            // appConfig carries neither an issuer nor an audience (verified against the dev DB), and
            // the issued tokens set neither — so validating them would reject every valid token.
            ValidateIssuer = false,
            ValidateAudience = false,
            // MUST match what JwtTokenService emits. Default RoleClaimType is the ClaimTypes.Role
            // schema URI, which silently matches nothing here — [Authorize(Roles = "Admin")] would
            // then 403 every user, including real Admins.
            RoleClaimType = JwtTokenService.RoleClaimType,
            NameClaimType = "name"
        };

        options.Events = new JwtBearerEvents
        {
            // Warms the key cache on an async path before the synchronous IssuerSigningKeyResolver
            // above runs, so that resolver is a cache read rather than a blocking DB call.
            OnMessageReceived = async context =>
                await keys.GetAsync(context.HttpContext.RequestAborted)
        };
    });

// Authenticated-by-default: a controller must opt OUT with [AllowAnonymous] (only AuthController
// does). A FallbackPolicy applies to endpoints that declare no authorization of their own, so
// forgetting [Authorize] on a new controller fails closed rather than silently exposing it.
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

var app = builder.Build();

// --- Pipeline ---------------------------------------------------------------
// FIRST, so every unhandled exception downstream (auth, MVC, repositories) is caught, logged in
// full, and answered with one generic 500 JSON — never a stack trace or SQL text. Registered in
// Development too: the alternative (developer exception page in dev, middleware in prod) would
// mean the error contract the frontend depends on is never exercised until production.
app.UseMiddleware<ExceptionHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "CMS API v1");
        options.RoutePrefix = "swagger";
    });
}

app.UseCors(CorsPolicy);
// Order is load-bearing: UseAuthentication must precede UseAuthorization. Without it nothing ever
// populates HttpContext.User, so the fallback policy would reject *every* request as anonymous —
// a valid token included — and the failure looks like "my token is wrong", not "middleware missing".
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

// Exposed so the xUnit test project can reference the entry-point assembly.
public partial class Program { }
