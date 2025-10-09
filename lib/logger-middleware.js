/**
 * Middleware for logging requests and responses in express.js
 *
 * @param logger Logger function to pass the messages to.
 * @return Middleware that performs request and response logging.
 */
export const requestLoggerMiddleware =
  ({ logger }) =>
  (req, res, next) => {
    logger("<<<", req.method, req.url);
    logger(req.body);

    res.send = sendInterceptor(res, res.send);
    res.on("finish", () => {
      logger(">>>", res.contentBody);
    });
    next();
  };

const sendInterceptor = (res, send) => (content) => {
  res.contentBody = content;
  res.send = send;
  res.send(content);
};
