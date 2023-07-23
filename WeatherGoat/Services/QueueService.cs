using System.Threading.Channels;

namespace WeatherGoat.Services;

public class QueueService : IDisposable
{
    private bool _disposed;
    
    private readonly ILogger<QueueService>      _logger;
    private readonly CancellationTokenSource    _cts;
    private readonly CancellationToken          _ct;
    private readonly TaskCompletionSource<bool> _cs;
    private readonly Channel<Func<Task>>        _channel;
    private readonly object                     _disposeLock;

    public QueueService(ILogger<QueueService> logger)
    {
        _logger = logger;
        _cts    = new CancellationTokenSource();
        _ct     = _cts.Token;
        _cs     = new TaskCompletionSource<bool>();
        _channel = Channel.CreateUnbounded<Func<Task>>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false,
        });
        _disposeLock = new object();

        _ = Task.Run(async () =>
        {
            await ProcessQueueAsync();
            _cs.TrySetResult(true);
        });
    }

    public async Task EnqueueActionAsync(Func<Task> action) => await _channel.Writer.WriteAsync(action, _ct);

    #region IDisposable
    public void Dispose()
    {
        lock (_disposeLock)
        {
            if (_disposed)
            {
                return;
            }
            
            _logger.LogDebug("Disposing");
            
            _cts?.Cancel();
        
            _channel.Writer.Complete();

            if (_channel.Reader.Count > 0)
            {
                _logger.LogInformation("Waiting for queue {Count} item(s) to finish", _channel.Reader.Count);

                WaitForCompletionAsync().Wait();
            }

            _cts?.Dispose();
            _disposed = true;
        }
    }
    #endregion

    private async Task WaitForCompletionAsync() => await _cs.Task;

    private async Task ProcessQueueAsync()
    {
        while (!_ct.IsCancellationRequested)
        {
            await foreach (var action in _channel.Reader.ReadAllAsync(_ct))
            {
                try
                {
                    await action();
                }
                catch (Exception e)
                {
                    _logger.LogError(e, "Error executing enqueued task");
                }
                finally
                {
                    await Task.Delay(500, _ct);
                }
            }
        }
    }
}
