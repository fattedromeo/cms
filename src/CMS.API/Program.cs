using CMS.API.Data;
using CMS.API.Repositories;
using Dapper;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicy = "LocalhostCors";

// Dapper type handlers. Course.ScheduleOn/ScheduleOff are SQL `date`, and neither Dapper 2.1.79
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
    options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "CMS API",
        Version = "v1",
        Description = "CMS backend Web API (Dapper, .NET 9)."
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
// Server-side only: reads SysConfig['appConfig'].defaultPassword. Never exposed via a controller —
// the same JSON holds symmetricSecurityKey (a JWT signing secret).
builder.Services.AddScoped<ISysConfigRepository, SysConfigRepository>();
builder.Services.AddScoped<IPublishStatusRepository, PublishStatusRepository>();
builder.Services.AddScoped<IPartnerRepository, PartnerRepository>();
builder.Services.AddScoped<ICourseGroupRepository, CourseGroupRepository>();
builder.Services.AddScoped<ICourseRepository, CourseRepository>();
builder.Services.AddScoped<ILookupRepository, LookupRepository>();

var app = builder.Build();

// --- Pipeline ---------------------------------------------------------------
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
app.UseAuthorization();
app.MapControllers();

app.Run();

// Exposed so the xUnit test project can reference the entry-point assembly.
public partial class Program { }
