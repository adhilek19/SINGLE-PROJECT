import mongoose from "mongoose";
import { env } from "./env.js";

export const connectDB=async()=>{
    try{ 
        await mongoose.connect(env.MONGO_URI)
        console.log(`MongoDB Connected: ${mongoose.connection.host}`)
    }catch(err){
        console.error(err.message)
        process.exit(1)
    }
};
