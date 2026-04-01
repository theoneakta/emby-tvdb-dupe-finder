FROM nginx:1.27-alpine

# Remove default nginx site
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx config
COPY nginx.conf /etc/nginx/conf.d/emby-duplicate-finder.conf

# Copy static app files
COPY index.html  /usr/share/nginx/html/
COPY script.js   /usr/share/nginx/html/
COPY styles.css  /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
