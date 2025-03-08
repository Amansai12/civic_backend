import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET,
});

const uploadOnCloudinary = async (file, foldername) => {
    try {
        if (!file) {
            throw new Error("File is required!");
        }

        const response = await cloudinary.uploader.upload(file, {
            resource_type: "auto",
            folder: foldername,
        });

        return response.secure_url;
    } catch (error) {
        console.log(error);
        return null;
    }
};

export default uploadOnCloudinary;