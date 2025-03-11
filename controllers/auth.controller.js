import bcryptjs from "bcryptjs";
import generateTokenAndCookies from "../utils/generateTokenAndCookies.js";
import { sendOtp, sendResetSuccess } from "../otp/sms_otp.js";
import { sendOTP_Email, sendResetLink, sendResetSuccessEmail } from "../otp/email_otp.js";
import prisma from "../prisma/index.js";

// required phone and password from frontend
export const userLogin = async (req, res) => {
    const { phone, password } = req.body;
    try {
        if (!phone || !password) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }
        const user = await prisma.citizen.findUnique({
            where: {
                phone,
            },
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        const isPasswordValid = await bcryptjs.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        generateTokenAndCookies(res, user.id, "citizen");

        user.password = undefined;

        res.status(200).json({
            success: true,
            message: "Logged in successfully",
            user: { ...user, type: "citizen",token : req.cookies.token },
        });
    } catch (error) {
        console.log("Error in login ", error);
        res.status(400).json({ success: false, message: error.message });
    }
};

// required email and password from frontend...
export const authorityLogin = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await prisma.authority.findUnique({
            where: {
                email,
            },
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        const isPasswordValid = await bcryptjs.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(400).json({ success: false, message: "Invalid credentials" });
        }

        generateTokenAndCookies(res, user.id, user.role);

        user.password = undefined;

        res.status(200).json({
            success: true,
            message: "Logged in successfully",
            user: { ...user, type: user.role },
        });
    } catch (error) {
        console.log("Error in login ", error);
        res.status(400).json({ success: false, message: error.message });
    }
};

// required name, phone, password, latitude, longitude from frontend
export const userSignup = async (req, res) => {
    const { name, phone, password, latitude, longitude } = req.body;
    try {
        if (!name || !phone || !password || !latitude || !longitude) {
            return res.status(400).json({ success: false, error: "All fields are required" });
        }
        const userExists = await prisma.citizen.findUnique({
            where: {
                phone,
            },
        });
        if (userExists) {
            return res.status(400).json({ success: false, error: "User Already Exists" });
        }
        const hashPassword = await bcryptjs.hash(password, 10);

        const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

        const user = await prisma.citizen.create({
            data: {
                name,
                phone,
                password: hashPassword,
                OTP: verificationToken,
                OTPExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
                latitude,
                longitude,
                isVerified: false,
            },
        });

        if (!user) {
            return res.status(400).json({ success: false, error: "User Not Created" });
        }

        await sendOtp("+91" + phone, verificationToken);

        generateTokenAndCookies(res, user.id, "citizen");

        user.password = undefined;
        res.status(201).json({ success: true, user });
    } catch (error) {
        console.log("Error occured in usersignup", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// required code from frontend
export const userVerifyToken = async (req, res) => {
    const { code } = req.body;
    const { userId } = req;
    console.log(userId);
    try {
        if (!code || !userId) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        const user = await prisma.citizen.findUnique({
            where: {
                id: userId,
            },
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "User Not Found" });
        }

        console.log(code);
        console.log(user);
        if (user.OTP !== code && user.OTPExpiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: "Invalid verification code" });
        }

        await prisma.citizen.update({
            where: {
                id: userId,
            },
            data: {
                isVerified: true,
                OTP: null,
                OTPExpiresAt: null,
            },
        });

        res.status(200).json({
            success: true,
            message: "User verified successfully",
        });
    } catch (error) {
        console.log("error in verifyEmail ", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// required code from frontend
export const authorityVerifyToken = async (req, res) => {
    const { code } = req.body;
    const { userId } = req;
    try {
        if (!code || !userId) {
            return res.status(400).json({ success: false, message: "All fields are required" });
        }

        const user = await prisma.authority.findUnique({
            where: {
                id: userId,
            },
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "User Not Found" });
        }

        if (user.verificationToken !== code && user.verificationTokenExpiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: "Invalid verification code" });
        }

        await prisma.authority.update({
            where: {
                id: userId,
            },
            data: {
                isVerified: true,
                verificationToken: null,
                verificationTokenExpiresAt: null,
            },
        });

        res.status(200).json({
            success: true,
            message: "Email verified successfully",
        });
    } catch (error) {
        console.log("error in verifyEmail ", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// required name, email, password, latitude, longitude, office, role from frontend
export const authoritySignup = async (req, res) => {
    const { name, email, password, office, authority, department } = req.body;
    try {
        if (!name || !email || !password || !authority || !office) {
            return res.status(400).json({ success: false, error: "All fields are required" });
        }
        const userExists = await prisma.authority.findUnique({
            where: {
                email,
            },
        });
        if (userExists) {
            return res.status(400).json({ success: false, error: "User Already Exists" });
        }

        const departmentExists = await prisma.department.findUnique({
            where: {
                officeId_name: {
                    officeId: office,
                    name: department,
                },
            },
        });
        let newDepartment;
        if (!departmentExists) {
            newDepartment = await prisma.department.create({
                data: {
                    officeId: office,
                    name: department,
                },
            });
        }
        const hashPassword = await bcryptjs.hash(password, 10);
        const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
        const user = await prisma.authority.create({
            data: {
                name,
                email,
                password: hashPassword,
                verificationToken,
                officeId: office,
                role: authority,
                isVerified: false,
                departmentName: department,
            },
        });

        if (!user) {
            return res.status(400).json({ success: false, error: "User Not Created" });
        }

        await sendOTP_Email(email, verificationToken);

        generateTokenAndCookies(res, user.id, authority);

        user.password = undefined;
        res.status(201).json({ success: true, user });
    } catch (error) {
        console.log("Error occured in usersignup", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// required email from frontend
export const userResendOTP = async (req, res) => {
    const { phone } = req.body;
    try {
        if (!phone) {
            return res.status(400).json({ success: false, message: "All fields are required!" });
        }

        const userExists = await prisma.citizen.findUnique({
            where: {
                phone,
            },
        });

        if (!userExists) {
            return res.status(400).json({ success: false, message: "User doesn't exist" });
        }

        let verificationToken = userExists.verificationToken;

        if (!userExists.OTPExpiresAt || userExists.OTPExpiresAt < new Date()) {
            verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
            await sendOtp("+91" + phone, verificationToken);

            await prisma.citizen.update({
                where: { phone },
                data: {
                    OTP: verificationToken,
                    OTPExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
                },
            });
        } else {
            await sendOtp("+91" + phone, verificationToken);
        }

        res.status(200).json({ success: true, message: "OTP Sent Successfully!" });
    } catch (error) {
        console.error("Error occurred in userResendOTP:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const authorityResendOTP = async (req, res) => {
    const { email } = req.body;
    try {
        if (!email) {
            return res.status(400).json({ success: false, message: "All fields are required!" });
        }
        const userExists = await prisma.authority.findUnique({
            where: {
                email,
            },
        });
        if (!userExists) {
            return res.status(400).json({ success: false, message: "User doesn't exists" });
        }
        let verificationToken = userExists.verificationToken;

        if (!userExists.verificationTokenExpiresAt || userExists.OTPExpiresAt < Date.now()) {
            verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
            await sendOTP_Email(email, verificationToken);

            await prisma.authority.update({
                where: {
                    email,
                },
                data: {
                    verificationToken,
                    verificationTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
                },
            });
        } else {
            await sendOTP_Email(email, verificationToken);
        }
        res.status(200).json({ success: true, message: "OTP Sent Successfully!" });
    } catch (error) {
        console.log("Error occured in userResetPassword : " + error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const userForgetPassword = async (req, res) => {
    const { phone } = req.body;
    try {
        if (!phone) {
            throw new Error("All fields are required");
        }
        const user = await prisma.citizen.findUnique({
            where: {
                phone,
            },
        });
        if (!user) {
            return res.status(400).json({ success: false, message: "User not found!" });
        }
        const Token = Math.floor(100000 + Math.random() * 900000).toString();
        const TokenAge = Date.now() + 1 * 60 * 60 * 1000;

        await prisma.citizen.update({
            where: {
                id: user.id,
            },
            data: {
                OTP: Token,
                OTPExpiresAt: new Date(TokenAge),
            },
        });

        await sendOtp("+91" + phone, Token);

        res.status(200).json({
            success: true,
            message: "Password reset code is send to your mobile",
        });
    } catch (error) {
        console.log("Error in forgotPassword ", error);
        res.status(400).json({ success: false, message: error.message });
    }
};

export const authorityForgetPassword = async (req, res) => {
    const { email } = req.body;
    try {
        if (!email) {
            throw new Error("All fields are required");
        }
        const user = await prisma.authority.findUnique({
            where: {
                email,
            },
        });
        if (!user) {
            return res.status(400).json({ success: false, message: "User not found!" });
        }
        const Token = Math.floor(100000 + Math.random() * 900000).toString();
        const TokenAge = Date.now() + 1 * 60 * 60 * 1000;

        prisma.authority.update({
            where: {
                id: user.id,
            },
            data: {
                resetPasswordToken: Token,
                resetPasswordExpiresAt: new Date(TokenAge),
            },
        });
        await sendResetLink(email, `${process.env.CLIENT_URL}/reset-password/u/${Token}`);
        res.status(200).json({
            success: true,
            message: "OTP sent your email",
        });
    } catch (error) {
        console.log("Error in forgotPassword ", error);
        res.status(400).json({ success: false, message: error.message });
    }
};

export const ResetUserPassword = async (req, res) => {
    const { phone, password } = req.body;
    try {
        const user = await prisma.citizen.findUnique({
            where: {
                phone,
            },
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "User Not Found" });
        }

        const haspassword = await bcryptjs.hash(password, 10);
        user.password = haspassword;

        await sendResetSuccess(user.phone);

        return res.status(200).json({ success: true, message: "Password reset successfully" });
    } catch (error) {
        console.log("Error occured while resetting password : ", error);
        return res.status(400).json({ success: false, error: error.message });
    }
};

export const ResetAuthorityPassword = async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;
    try {
        const user = await prisma.authority.findFirst({
            where: {
                resetPasswordToken: token,
                resetPasswordExpiresAt: {
                    gt: new Date(),
                },
            },
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired reset token",
            });
        }
        const haspassword = await bcryptjs.hash(password, 10);
        prisma.user.update(
            {
                where: {
                    id: user.id,
                },
            },
            {
                data: {
                    password: haspassword,
                    resetPasswordToken: undefined,
                    resetPasswordExpiresAt: undefined,
                },
            }
        );

        await sendResetSuccessEmail(user.email);

        return res.status(200).json({ success: true, message: "Password reset successfully" });
    } catch (error) {
        console.log("Error occured while resetting password : ", error);
        return res.status(400).json({ success: false, error: error.message });
    }
};

export const logout = async (req, res) => {
    try {
        res.clearCookie("token");

        res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });
    } catch (error) {
        console.error("Logout error:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const verifyUserOtp_ResetPassword = async (req, res) => {
    const { phone } = req.body;
    const { OTP } = req.body;
    try {
        if (!OTP) {
            return res.status(400).json({ success: false, message: "OTP is required!", flag: 0 });
        }

        const user = await prisma.citizen.findFirst({
            where: {
                OTP,
                OTPExpiresAt: {
                    gt: new Date(),
                },
            },
            select : {
                id : true,
                name : true,
                myList : true,
                phone : true,
                profileImage : true
            }
        });
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid details", flag: 0 });
        }
        if (user.OTP !== OTP && user.OTPExpiresAt < Date.now()) {
            return res.status(400).json({ success: false, message: "Invalid verification code", flag: 0 });
        }

        await prisma.citizen.update({
            where: {
                id: user.id,
            },
            data: {
                OTP: null,
                OTPExpiresAt: null,
            },
        });

        res.status(200).json({
            success: true,
            user : user,
            token : req.cookies.token
        });
    } catch (error) {
        console.log("Error occured verifying OTP ", error);
        res.status(500).json({ success: false, message: "Server error", flag: 0 });
    }
};

export const getUser = async (req, res) => {
    const userId = req.userId;
    const type = req.type;
    try {
        if (type === "citizen") {
            const user = await prisma.citizen.findUnique({
                where: {
                    id: userId,
                },
                include: {
                    Notifications: true,
                    upVoted: {
                        select: {
                            id: true,
                        },
                    },
                    myList:true
                },
            });
            if (!user) {
                return res.status(400).json({ success: false, message: "User not found" });
            }
            return res.status(200).json({
                success: true,
                user: { ...user, type },
            });
        } else {
            const user = await prisma.authority.findUnique({
                where: {
                    id: userId,
                },
                include: {
                    office: true,
                },
            });
            if (!user) {
                return res.status(400).json({ success: false, message: "User not found" });
            }
            return res.status(200).json({
                success: true,
                user: { ...user, type },
            });
        }
    } catch (error) {
        console.log("Error occured while getting user ", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const myList = async (req, res) => {
    const userId = req.userId;
    const type = req.type;
    try {
        if (type !== "citizen") {
            return res.status(400).json({ success: false, message: "You are not authorized to view this page" });
        }
        const user = await prisma.citizen.findUnique({
            where: {
                id: userId,
            },
            include: {
                myList: true,
                upVoted: true,
            },
        });

        res.status(200).json({
            success: true,
            user: { ...user, type },
        });
    } catch (error) {
        console.log("Error occured while getting user ", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const editAuthProfile = async (req, res) => {
    const { name, email, profileImage, id } = req.body;

    try {
        if (!name || !email) {
            return res.status(400).json({ success: false, error: "All fields are required" });
        }

        const user = await prisma.authority.findUnique({
            where: {
                id,
            },
        });

        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        // Check if the email is being changed
        if (user.email !== email) {
            // Check if the new email is already in use
            const userWithThisEmail = await prisma.authority.findUnique({
                where: {
                    email,
                },
            });

            if (userWithThisEmail) {
                return res.status(400).json({ success: false, error: "Email is already in use" });
            }

            // Generate and send OTP
            const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

            await prisma.authority.update({
                where: {
                    id,
                },
                data: {
                    verificationToken: verificationToken,
                    verificationTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000), // OTP expires in 1 hour
                },
            });

            await sendOTP_Email(email, verificationToken);

            return res.status(200).json({
                success: true,
                message: "OTP sent to the new email address",
                requiresOtp: true, // Indicate that OTP verification is required
            });
        }

        // If email is not being changed, update profile directly
        const updatedUser = await prisma.authority.update({
            where: {
                id,
            },
            data: {
                name,
                email,
                profileImage,
            },
        });

        res.status(200).json({ success: true, user: updatedUser });
    } catch (error) {
        console.log("Error in updating authority ", error);
        res.status(400).json({ success: false, error: error.message });
    }
};

export const verifyOtpForEmailUpdate = async (req, res) => {
    const { name, email, profileImage, id, otp } = req.body;

    try {
        if (!name || !email || !otp) {
            return res.status(400).json({ success: false, error: "All fields are required" });
        }

        const user = await prisma.authority.findUnique({
            where: {
                id,
            },
        });

        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }

        // Verify OTP
        if (otp !== user.verificationToken || new Date() > new Date(user.verificationTokenExpiresAt)) {
            return res.status(400).json({ success: false, error: "Invalid or expired OTP" });
        }

        // Update the user's profile
        const updatedUser = await prisma.authority.update({
            where: {
                id,
            },
            data: {
                name,
                email,
                profileImage,
                verificationToken: null,
                verificationTokenExpiresAt: null,
            },
        });

        res.status(200).json({ success: true, user: updatedUser });
    } catch (error) {
        console.log("Error in verifying OTP for email update ", error);
        res.status(400).json({ success: false, error: error.message });
    }
};

export const getAuthorities = async (req, res) => {
    const userId = req.userId;
    try {
        const admin = await prisma.authority.findUnique({
            where: {
                id: userId,
            },
            select:{
                id : true,
                officeId : true,
                role : true,
            }
        });
        if (!admin) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        if(admin.role !== "Representative authority") {
            console.log(admin.role);
            return res.status(403).json({ success: false, error: "You are not authorized to perform this action" });
        }
        const authorities = await prisma.authority.findMany({
            where: {
                officeId: admin.officeId,
            },
            select:{
                id : true,
                name : true,
                email : true,
                officeId : true,
                role : true,
                profileImage : true,
            }
        });
        res.status(200).json({ success: true, authorities });
    } catch (e) {
        console.log("Error in getAuthorities ", e);
        res.status(400).json({ success: false, error: e.message });
    }
}