using System.ComponentModel.DataAnnotations;

namespace TeamleadsBackend.Endpoints;

// Runs DataAnnotations on a DTO and shapes failures into the dictionary that
// Results.ValidationProblem expects. Minimal APIs don't auto-validate, so each
// public endpoint calls this explicitly.
public static class Validation
{
    public static bool Fails(object model, out Dictionary<string, string[]> errors)
    {
        var ctx = new ValidationContext(model);
        var results = new List<ValidationResult>();
        errors = new Dictionary<string, string[]>();
        if (Validator.TryValidateObject(model, ctx, results, validateAllProperties: true))
            return false;

        errors = results
            .SelectMany(r => r.MemberNames.DefaultIfEmpty("").Select(m => (Member: m, r.ErrorMessage)))
            .GroupBy(x => x.Member, x => x.ErrorMessage ?? "Invalid")
            .ToDictionary(g => g.Key, g => g.ToArray());
        return true;
    }
}
