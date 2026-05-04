//logging library
import winston from 'winston' 
import {env} from "../config/env.js"

const {combine,timestamp,json, colorize, printf, errors } = winston.format;
//development format 
const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, requestId, stack }) => {
    const rid = requestId ? ` [${requestId}]` : '';
    return `${timestamp}${rid} ${level}: ${stack || message}`;
  })
);
  // production format 
const prodFormat=combine(
    timestamp(),
    errors({stack:true}),
    json()
);

export const logger = winston.createLogger({
    level: env.NODE_ENV==='production'?'warn':'debug',
    format:env.NODE_ENV==='production'?prodFormat: devFormat,
    transports:[
        new winston.transports.Console(),
    ],
})