using System.Collections.Generic;

public class Operator
{
    public string Id          { get; set; }
    public string Username    { get; set; }
    public string Password    { get; set; }
    public string DisplayName { get; set; }
    public List<string> Permissions { get; set; } = new List<string>();
}
