FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN mkdir -p data
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node healthcheck.js
CMD ["node", "--env-file-if-exists=.env", "src/app.js"]
