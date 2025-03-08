import nodemailer from "nodemailer";
import dotenv from "dotenv";
import {
    VERIFICATION_EMAIL_TEMPLATE,
    PASSWORD_RESET_REQUEST_TEMPLATE,
    PASSWORD_RESET_SUCCESS_TEMPLATE,
} from "./email_templates.js";

dotenv.config({ path: "./.env" });

const transporter = nodemailer.createTransport({
    service: "gmail",
    port: 587,
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASSWORD,
    },
});

export const sendOTP_Email = async (email, otp) => {
    try {
        if (!email || !otp) {
            console.error("Email and OTP are required.");
            return;
        }
        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: email,
            subject: "Email Verification OTP",
            html: VERIFICATION_EMAIL_TEMPLATE.replace("verificationCode", otp),
        };
        const info = await transporter.sendMail(mailOptions);
        console.log("OTP sent successfully to: " + info.response);
    } catch (error) {
        console.error("Error OTP to email : ", error);
    }
};

export const sendResetLink = async (email, otp) => {
    try {
        if (!email || !otp) {
            console.error("Email and OTP are required.");
            return;
        }
        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: email,
            subject: "Password Reset Link",
            html: PASSWORD_RESET_REQUEST_TEMPLATE.replace("verificationCode", otp),
        };
        const info = await transporter.sendMail(mailOptions);
        console.log("Reset OTP sent successfully to: " + info.response);
    } catch (error) {
        console.error("Error sending OTP to email : ", error);
    }
};

export const sendResetSuccessEmail = async (email) => {
    try {
        if (!email) {
            console.error("Email and OTP are required.");
            return;
        }
        const mailOptions = {
            from: process.env.GMAIL_USER,
            to: email,
            subject: "Email Verification OTP",
            html: PASSWORD_RESET_SUCCESS_TEMPLATE,
        };
        const info = await transporter.sendMail(mailOptions);
        console.log("Reset OTP sent successfully to: " + info.response);
    } catch (error) {
        console.error("Error sending OTP to email : ", error);
    }
};
