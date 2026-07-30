using Microsoft.EntityFrameworkCore;

namespace TeamleadsBackend.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Feedback> Feedback => Set<Feedback>();
    public DbSet<Submission> Submissions => Set<Submission>();
    public DbSet<AnonRequest> AnonRequests => Set<AnonRequest>();
    public DbSet<BotPost> BotPosts => Set<BotPost>();
    public DbSet<Paste> Pastes => Set<Paste>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<OutboxMessage> Outbox => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Feedback>(e =>
        {
            e.Property(x => x.Message).HasMaxLength(4000).IsRequired();
            e.Property(x => x.Page).HasMaxLength(512);
            e.Property(x => x.Contact).HasMaxLength(256);
            e.Property(x => x.IpHash).HasMaxLength(64);
            e.HasIndex(x => x.CreatedAt);
            e.HasIndex(x => x.Handled);
        });

        b.Entity<Submission>(e =>
        {
            e.Property(x => x.Type).HasMaxLength(32).IsRequired();
            e.Property(x => x.Title).HasMaxLength(200).IsRequired();
            e.Property(x => x.Url).HasMaxLength(512);
            e.Property(x => x.Author).HasMaxLength(120);
            e.Property(x => x.Notes).HasMaxLength(2000);
            e.Property(x => x.IpHash).HasMaxLength(64);
            e.Property(x => x.Status).HasMaxLength(16).IsRequired();
            e.HasIndex(x => x.CreatedAt);
            e.HasIndex(x => x.Status);
        });

        b.Entity<AnonRequest>(e =>
        {
            e.Ignore(x => x.PublishText);   // computed in code, not a column
            e.Property(x => x.PublicId).HasMaxLength(12).IsRequired();
            e.Property(x => x.Text).HasMaxLength(4000).IsRequired();
            e.Property(x => x.EditedText).HasMaxLength(4000);
            e.Property(x => x.Source).HasMaxLength(16).IsRequired();
            e.Property(x => x.Status).HasMaxLength(16).IsRequired();
            e.Property(x => x.AuthorHash).HasMaxLength(64);
            e.Property(x => x.RejectReason).HasMaxLength(256);
            e.HasIndex(x => x.PublicId).IsUnique();
            e.HasIndex(x => x.CreatedAt);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.AuthorHash);
        });

        b.Entity<BotPost>(e =>
        {
            e.Property(x => x.Kind).HasMaxLength(16).IsRequired();
            e.Property(x => x.Key).HasMaxLength(128).IsRequired();
            e.HasIndex(x => new { x.Kind, x.Key });
            e.HasIndex(x => x.PostedAt);
        });

        b.Entity<OutboxMessage>(e =>
        {
            e.Property(x => x.Kind).HasMaxLength(32).IsRequired();
            e.Property(x => x.ChatSetting).HasMaxLength(64);
            e.Property(x => x.Text).HasMaxLength(4096).IsRequired();
            e.Property(x => x.RelatedKind).HasMaxLength(32);
            e.Property(x => x.RelatedKey).HasMaxLength(64);
            e.Property(x => x.Status).HasMaxLength(16).IsRequired();
            e.Property(x => x.LastError).HasMaxLength(512);
            // The dispatcher's only query: pending rows that are due.
            e.HasIndex(x => new { x.Status, x.NextAttemptAt });
        });

        b.Entity<Paste>(e =>
        {
            e.Property(x => x.PublicId).HasMaxLength(12).IsRequired();
            e.Property(x => x.Content).IsRequired();
            e.Property(x => x.Language).HasMaxLength(32).IsRequired();
            e.Property(x => x.AuthorName).HasMaxLength(120);
            e.Property(x => x.IpHash).HasMaxLength(64);
            e.Property(x => x.Source).HasMaxLength(16).IsRequired();
            e.HasIndex(x => x.PublicId).IsUnique();
            e.HasIndex(x => x.CreatedAt);
        });

        b.Entity<Setting>(e =>
        {
            e.HasKey(x => x.Key);
            e.Property(x => x.Key).HasMaxLength(64);
            e.Property(x => x.Value).HasMaxLength(2000).IsRequired();
        });
    }
}
