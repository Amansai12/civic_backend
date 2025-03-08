import jwt from "jsonwebtoken";
const generateTokenAndCookies = (res, userId, type) => {
    const token = jwt.sign({ userId,type }, process.env.JWT_SECRET_KEY, { expiresIn: "7d" });
    res.cookie("token", token, {
        httpOnly: true,
        sameSite: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return token;
};

export default generateTokenAndCookies;
