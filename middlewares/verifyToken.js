import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized - No token provided",
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

        if (!decoded) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized - Invalid token",
            });
        }

        req.userId = decoded.userId;
        req.type = decoded.type;
        next();
    } catch (error) {
        console.error("Error verifying token:", error.message);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};
