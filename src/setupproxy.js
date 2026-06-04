const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'https://api.anthropic.com',
      changeOrigin: true,
      pathRewrite: { '^/api': '' },
      on: {
        proxyReq: (proxyReq, req) => {
          proxyReq.setHeader('x-api-key', req.headers['x-api-key']);
          proxyReq.setHeader('anthropic-version', '2023-06-01');
        },
      },
    })
  );
};