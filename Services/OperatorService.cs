using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;

public class OperatorService
{
    private readonly string _filePath;
    private readonly object _lock = new object();

    private static readonly JsonSerializerOptions _opts =
        new JsonSerializerOptions { PropertyNameCaseInsensitive = true, WriteIndented = true };

    public OperatorService(IHostingEnvironment env)
    {
        _filePath = Path.Combine(env.ContentRootPath, "Data", "operators.json");
    }

    public List<Operator> GetAll()
    {
        lock (_lock)
        {
            var json = File.ReadAllText(_filePath);
            return JsonSerializer.Deserialize<List<Operator>>(json, _opts) ?? new List<Operator>();
        }
    }

    public Operator GetByUsername(string username)
        => GetAll().FirstOrDefault(o => o.Username == username);

    public void Add(Operator op)
    {
        lock (_lock)
        {
            var all = GetAll();
            op.Id = Guid.NewGuid().ToString();
            all.Add(op);
            Save(all);
        }
    }

    public bool Update(Operator op)
    {
        lock (_lock)
        {
            var all = GetAll();
            var idx = all.FindIndex(o => o.Id == op.Id);
            if (idx < 0) return false;
            // 비밀번호 미입력 시 기존 유지
            if (string.IsNullOrWhiteSpace(op.Password))
                op.Password = all[idx].Password;
            all[idx] = op;
            Save(all);
            return true;
        }
    }

    public bool Delete(string id)
    {
        lock (_lock)
        {
            var all = GetAll();
            var removed = all.RemoveAll(o => o.Id == id);
            if (removed == 0) return false;
            Save(all);
            return true;
        }
    }

    private void Save(List<Operator> data)
        => File.WriteAllText(_filePath, JsonSerializer.Serialize(data, _opts));
}
