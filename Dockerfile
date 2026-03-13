FROM nginx:alpine
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/login.html /usr/share/nginx/html/login.html
COPY nginx/admin.html /usr/share/nginx/html/admin.html
COPY nginx/channels.html /usr/share/nginx/html/channels.html
