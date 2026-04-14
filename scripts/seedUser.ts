import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../src/models/User";

dotenv.config();

const USERNAME = "admin";
const PASSWORD = "1234"; // Change this before running

async function seedUser(): Promise<void> {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log("Connected to MongoDB");

    const existing = await User.findOne({ username: USERNAME });
    if (existing) {
      console.log(`User "${USERNAME}" already exists. Skipping.`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    await User.create({ username: USERNAME, password: hashedPassword });

    console.log(`User created successfully`);
    console.log(`  Username: ${USERNAME}`);
    console.log(`  Password: ${PASSWORD}`);
    console.log(
      `Change the password in this script before running in production.`,
    );
    process.exit(0);
  } catch (error: any) {
    console.error(`Seed failed: ${error.message}`);
    process.exit(1);
  }
}

seedUser();
