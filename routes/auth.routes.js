import express from "express";
import {
    userLogin,
    authorityLogin,
    userSignup,
    authoritySignup,
    userVerifyToken,
    authorityVerifyToken,
    userResendOTP,
    authorityResendOTP,
    ResetUserPassword,
    ResetAuthorityPassword,
    verifyUserOtp_ResetPassword,
    userForgetPassword,
    authorityForgetPassword,
    getUser,
    editAuthProfile,
    verifyOtpForEmailUpdate,
    getAuthorities,
    logout,
} from "../controllers/auth.controller.js";

import { verifyToken } from "../middlewares/verifyToken.js";

const authRouter = express.Router();

authRouter.post("/userlogin", userLogin);
authRouter.post("/authoritylogin", authorityLogin);

authRouter.post("/usersignup", userSignup);
authRouter.post("/authoritysignup", authoritySignup);

authRouter.post("/user-verify-token", verifyToken, userVerifyToken);
authRouter.post("/authority-verify-token", verifyToken, authorityVerifyToken);

authRouter.post("/userResentOTP", userResendOTP);
authRouter.post("/user-forgot-password", userForgetPassword);
authRouter.post("/authority-forgot-password", authorityForgetPassword);

authRouter.post("/authorityResentOTP", authorityResendOTP);

authRouter.post("/userResetPassword", ResetUserPassword);
authRouter.post("/authorityResetPassword", ResetAuthorityPassword);

authRouter.post("/verify-user-otp", verifyUserOtp_ResetPassword);

authRouter.post("/update-authority", verifyToken, editAuthProfile);

authRouter.post("/verify-otp-email-update", verifyToken, verifyOtpForEmailUpdate);

authRouter.get('/authorities', verifyToken, getAuthorities);
authRouter.get('/logout',verifyToken,logout)

authRouter.get("/", verifyToken, getUser);

export default authRouter;
