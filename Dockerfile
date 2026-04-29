FROM nginx:1.27.4-alpine

LABEL org.opencontainers.image.title="emby-tvdb-dupe-finder" \
      org.opencontainers.image.source="https://github.com/theoneakta/emby-tvdb-dupe-finder"

# Remove default nginx site
RUN rm /etc/nginx/conf.d/default.conf

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/emby-duplicate-finder.conf

# Copy app
COPY index.html /usr/share/nginx/html/index.html
COPY logo.svg   /usr/share/nginx/html/logo.svg

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

CMD ["/entrypoint.sh"]