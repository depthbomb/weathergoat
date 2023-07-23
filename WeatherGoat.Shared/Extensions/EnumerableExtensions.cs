using System.Security.Cryptography;

namespace WeatherGoat.Shared.Extensions;

public static class EnumerableExtensions
{
    /// <summary>
    ///     Concatenates the members of a collection, using the specified separator between each member.
    /// </summary>
    /// <param name="data">Collection to join</param>
    /// <param name="separator">
    ///     The character to use as a separator. separator is included in the returned string only if
    ///     values has more than one element.
    /// </param>
    /// <param name="func">Optional transformation to apply to each element before concatenation.</param>
    /// <typeparam name="T">The type of the members of values.</typeparam>
    /// <returns>
    ///     A string that consists of the members of values delimited by the separator character. -or- Empty if values has
    ///     no elements.
    /// </returns>
    public static string Join<T>(this IEnumerable<T> data, char separator, Func<T, string>? func = null)
        => string.Join(separator, data.Select(func ?? (x => x?.ToString() ?? string.Empty)));

    /// <summary>
    ///     Concatenates the members of a collection, using the specified separator between each member.
    /// </summary>
    /// <param name="data">Collection to join</param>
    /// <param name="separator">
    ///     The string to use as a separator.separator is included in the returned string only if values
    ///     has more than one element.
    /// </param>
    /// <param name="func">Optional transformation to apply to each element before concatenation.</param>
    /// <typeparam name="T">The type of the members of values.</typeparam>
    /// <returns>
    ///     A string that consists of the members of values delimited by the separator character. -or- Empty if values has
    ///     no elements.
    /// </returns>
    public static string Join<T>(this IEnumerable<T> data, string separator, Func<T, string>? func = null)
        => string.Join(separator, data.Select(func ?? (x => x?.ToString() ?? string.Empty)));
    
    /// <summary>
    ///     Randomize element order by performing the Fisher-Yates shuffle
    /// </summary>
    /// <typeparam name="T">Item type</typeparam>
    /// <param name="items">Items to shuffle</param>
    public static IReadOnlyList<T> Shuffle<T>(this IEnumerable<T> items)
    {
        using (var rng = RandomNumberGenerator.Create())
        {
            var list = items.ToList();
            var n    = list.Count;
            while (n > 1)
            {
                var box = new byte[(n / byte.MaxValue) + 1];
                int boxSum;
                do
                {
                    rng.GetBytes(box);
                    boxSum = box.Sum(b => b);
                } while (!(boxSum < n * (byte.MaxValue * box.Length / n)));

                var k = boxSum % n;
                n--;
                (list[k], list[n]) = (list[n], list[k]);
            }

            return list;
        }
    }

    /// <summary>
    ///     Returns a random item.
    /// </summary>
    /// <typeparam name="T">The type of the members of values.</typeparam>
    /// <returns>A random item of type <typeparamref name="T"/></returns>
    public static T GetRandomItem<T>(this IEnumerable<T> items) => items.Shuffle()[0];

    /// <summary>
    ///     Creates a task that will complete when all of the <see cref="Task{TResult}" /> objects in an enumerable
    ///     collection have completed
    /// </summary>
    /// <param name="tasks">The tasks to wait on for completion.</param>
    /// <typeparam name="TResult">The type of the completed task.</typeparam>
    /// <returns>A task that represents the completion of all of the supplied tasks.</returns>
    public static Task<TResult[]> WhenAll<TResult>(this IEnumerable<Task<TResult>> tasks) => Task.WhenAll(tasks);

    /// <summary>
    ///     Creates a task that will complete when all of the <see cref="Task" /> objects in an enumerable
    ///     collection have completed
    /// </summary>
    /// <param name="tasks">The tasks to wait on for completion.</param>
    /// <returns>A task that represents the completion of all of the supplied tasks.</returns>
    public static Task WhenAll(this IEnumerable<Task> tasks) => Task.WhenAll(tasks);
}
