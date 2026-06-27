# Multi-stage build: SDK compiles + publishes, runtime image only carries the output.
# No docker-compose anywhere – this image is run with `docker run` (see run.sh / CI).
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Restore first (cached while the csproj is unchanged), then publish.
COPY TeamleadsBackend.csproj ./
RUN dotnet restore
COPY . .
RUN dotnet publish TeamleadsBackend.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app ./

# Kestrel listens on 8080; the container is published to 127.0.0.1:5080 on the host.
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

# Drop privileges – the aspnet image ships a non-root `app` user.
USER app

ENTRYPOINT ["dotnet", "TeamleadsBackend.dll"]
