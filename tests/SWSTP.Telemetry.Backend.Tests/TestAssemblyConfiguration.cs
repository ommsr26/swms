using Xunit;

// Disable parallel test execution across test classes since tests run against SQL Server
[assembly: CollectionBehavior(DisableTestParallelization = true)]
