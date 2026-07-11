FROM node:20-slim

WORKDIR /app

# 先拷贝 package 文件以利用 Docker 缓存
COPY relay/package.json relay/package.json
COPY shared-types/package.json shared-types/package.json

# 安装 tsx 用于直接运行 TypeScript
RUN npm install -g tsx

WORKDIR /app/relay
RUN npm install --production

WORKDIR /app

# 拷贝源码
COPY shared-types/ shared-types/
COPY relay/ relay/

WORKDIR /app/relay

EXPOSE 7780

ENV PA_RELAY_PORT=7780
ENV PA_RELAY_HOST=0.0.0.0

CMD ["npx", "tsx", "src/server.ts"]
