const HttpError = require("../utils/httpError");

const validate = (schema, target = "body") => {
  return (req, _res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return next(new HttpError(error.details.map((d) => d.message).join(", "), 400));
    }

    req[target] = value;
    return next();
  };
};

module.exports = validate;
