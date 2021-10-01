const app = require("./lib/app");

const port = process.env.SIGNING_SERVICE_PORT || "6000";

app.listen(port, () => console.debug(`Example app listening on port ${port}!`));
