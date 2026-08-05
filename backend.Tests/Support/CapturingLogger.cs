using Microsoft.Extensions.Logging;

namespace TeamleadsBackend.Tests.Support;

// An ILogger that keeps its lines so a test can assert on them.
//
// Only for behaviour whose whole point IS the log line – "this process announces which
// settings it believes" is a diagnostic feature, not a side effect, and a feature with no
// test is one that quietly stops working. Normal code paths should be asserted on state,
// not on log text.
public sealed class CapturingLogger<T> : ILogger<T>
{
    public List<string> Lines { get; } = [];

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel level) => true;

    public void Log<TState>(LogLevel level, EventId id, TState state, Exception? ex, Func<TState, Exception?, string> formatter) =>
        Lines.Add(formatter(state, ex));

    public bool Said(string fragment) =>
        Lines.Any(l => l.Contains(fragment, StringComparison.OrdinalIgnoreCase));
}
