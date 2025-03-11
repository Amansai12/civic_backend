import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.js";
import cors from "cors";
import issueRouter from "./routes/issue.routes.js";
import officeRouter from "./routes/office.routes.js";

import fileUpload from "express-fileupload";

dotenv.config();
const app = express();

app.use(
    cors({
        credentials: true,
        origin: ["http://localhost:5173","http://localhost:5174"],
    })
);
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ useTempFiles: true }));

app.use("/auth", authRoutes);
app.use("/issue", issueRouter);
app.use("/office", officeRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Server running at http://localhost:" + PORT);
});
