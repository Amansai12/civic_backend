import twilio from "twilio";
import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

const client = twilio(accountSid, authToken);

export const sendOtp = async (phone, otp) => {
    try {
        if (!phone || !otp) {
            console.log("All fields are required");
            return;
        }
        const message = await client.messages.create({
            body: `Your OTP is ${otp}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone,
        });
        console.log("OTP Sent Successfully!");
    } catch (error) {
        console.error(error);
    }
};

export const sendResetSuccess = async (phone) => {
    try {
        if (!phone) {
            console.log("All fields are required!");
            return;
        }
        const message = await client.message.create({
            body: `Your password has been changed succeessfully`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone,
        });
        console.log("success reset info send to : " + phone);
    } catch (errr) {
        console.log("Error occured!");
    }
};
