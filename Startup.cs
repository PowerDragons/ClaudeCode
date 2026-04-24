using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

public class Startup
{
    public IConfiguration Configuration { get; }

    public Startup(IConfiguration configuration)
    {
        Configuration = configuration;
    }

    public void ConfigureServices(IServiceCollection services)
    {
        services.AddMvc();

        services.AddDistributedMemoryCache();
        services.AddSession(o =>
        {
            o.IdleTimeout = TimeSpan.FromHours(8);
            o.Cookie.HttpOnly = true;
            o.Cookie.IsEssential = true;
        });

        var tenantId     = Configuration["AzureAd:TenantId"];
        var clientId     = Configuration["AzureAd:ClientId"];
        var clientSecret = Configuration["AzureAd:ClientSecret"];

        services.AddSingleton(new GraphApiClient(tenantId, clientId, clientSecret));
        services.AddSingleton<OperatorService>();
    }

    public void Configure(IApplicationBuilder app, IHostingEnvironment env)
    {
        if (env.IsDevelopment())
            app.UseDeveloperExceptionPage();

        app.UseSession();
        app.UseMiddleware<AuthMiddleware>();
        app.UseDefaultFiles();
        app.UseStaticFiles();
        app.UseMvc();
    }
}
