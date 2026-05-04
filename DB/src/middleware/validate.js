import { AppError } from "../utils/AppError.js";


export const validate = (schema) => (req, res, next) => {
  // Pre-process for multipart/form-data stringified objects
  const fieldsToParse = ['source', 'destination', 'vehicle', 'preferences'];
  fieldsToParse.forEach(field => {
    if (req.body[field] && typeof req.body[field] === 'string') {
      try {
        req.body[field] = JSON.parse(req.body[field]);
      } catch (e) {
        // Leave as is, Joi will catch if it's invalid
      }
    }
  });

  const { error, value } = schema.validate(req.body, {
    abortEarly: false,          
    stripUnknown: true,        
  });

  if (error) {
    const message = error.details.map(d => d.message).join(', ');
    return next(new AppError(message, 422));
  }

  req.body = value;  
  next();
};
