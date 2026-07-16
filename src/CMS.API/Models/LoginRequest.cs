using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Credentials posted to <c>POST /api/auth/login</c>.</summary>
/// <remarks>
/// 🔐 <see cref="Password"/> is the plaintext password. It is hashed and discarded inside the
/// controller action — never log this object, never echo it back, and never persist it.
/// </remarks>
public class LoginRequest
{
    [Required(ErrorMessage = "請輸入使用者代碼。")]
    public string UserId { get; set; } = string.Empty;

    [Required(ErrorMessage = "請輸入密碼。")]
    public string Password { get; set; } = string.Empty;
}
