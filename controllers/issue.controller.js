import { Prisma, PrismaClient } from "@prisma/client";
import prisma from "../prisma/index.js";
import PDFDocument from "pdfkit";
import amqp from "amqplib";
import uploadOnCloudinary from "../utils/cloudinary.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const departments = [
    "administration",
    "agriculture",
    "education",
    "health",
    "welfare",
    "transport",
    "environment",
    "engineering",
];



const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function generateResponse(description) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        
        const prompt = `imagine yourself as a issue prioritizer and you will prioritize issue based on the given description
                    if you are given a description you have to priotize the issue there are theree priorities
                    1) NORMAL
                    2) URGENT
                    3) SEVERE
                    you have to just return the priority for example
                    description = a current pole has falled down in the street and the electric wires are on the roads
                    output = SEVERE
                    like this you have to return output
                    so given description = ${description}`

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text(); // Extract text output

        return text; // Store result in a variable
    } catch (error) {
        console.error("Error generating response:", error);
        return null;
    }
}

async function sendNotification(phone, body) {
    try{
        const connection = await amqp.connect(process.env.RABBITMQ_URL);
        const channel = await connection.createChannel();
        await channel.assertExchange("notification-exchange", "direct", {
            durable: true,
        });
        await channel.assertQueue("notification-queue");
        channel.bindQueue("notification-queue", "notification-exchange", "notification-routing-key");
        const notification = {
            phone,
            body
        };
        channel.publish("notification-exchange", "notification-routing-key", Buffer.from(JSON.stringify(notification)));
    }catch(err){
        console.log("queue eroor")
    }

}

// Function to find the nearest office
const findNearestOffice = async (prisma, latitude, longitude) => {
    const [nearestOffice] = await prisma.$queryRaw`
        SELECT 
            id, 
            name, 
            latitude, 
            longitude,
            ST_Distance(
                ST_SetSRID(ST_GeomFromText(location), 4326),
                ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
            ) AS distance
        FROM "Office"
        ORDER BY ST_SetSRID(ST_GeomFromText(location), 4326) <-> ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)
        LIMIT 1;
    `;
    return nearestOffice;
};

// Create Issue controller
export const createIssue = async (req, res) => {
    
        const { title, description, latitude, longitude, isAnonymous, address } = req.body;
        const image = req.files.image;
        const audio = req.files.audio;
        const userId = req.userId;
        const anonymous = isAnonymous == "true" ? true : false;
    
        try {
            // Input validation
            if (!title || !description || !latitude || !longitude) {
                return res.status(400).json({
                    success: false,
                    error: "All fields are required",
                });
            }
    
            if (image) {
                if (!image.mimetype.startsWith("image/")) {
                    return res.status(400).json({
                        success: false,
                        error: "Image must be an image",
                    });
                }
            }
    
            if (audio) {
                if (!audio.mimetype.startsWith("audio/")) {
                    return res.status(400).json({
                        success: false,
                        error: "Audio must be an audio",
                    });
                }
            }
    
            if (image) {
                if (image.size > 1024 * 1024 * 10) {
                    return res.status(400).json({
                        success: false,
                        error: "Image size should be less than 10MB",
                    });
                }
            }
    
            if (audio) {
                if (audio.size > 1024 * 1024 * 10) {
                    return res.status(400).json({
                        success: false,
                        error: "Audio size should be less than 10MB",
                    });
                }
            }
            
            let imageUrl = ""
            let audioUrl = ""

            if(image) imageUrl = await uploadOnCloudinary(image.tempFilePath, "issues");
            if(audio) audioUrl = await uploadOnCloudinary(audio.tempFilePath, "issues");
    
            // Validate coordinates
            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);
    
            if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                return res.status(400).json({
                    success: false,
                    error: "Invalid coordinates",
                });
            }
    
            const nearestOffice = await findNearestOffice(prisma, lat, lng);
    
            if (!nearestOffice) {
                return res.status(400).json({
                    success: false,
                    error: "No nearest office found",
                });
            }

            let priority = generateResponse(description);
            if(!priority) priority = "NORMAL"

    
            // Create the issue using raw query with geometry cast to text
            const [issue] = await prisma.$queryRaw`
        WITH new_issue AS (
            INSERT INTO "Issue" (
                "id",
                "title",
                "description",
                "latitude",
                "longitude",
                "officeId",
                "userId",
                "location",
                "status",
                "isAnonymous",
                "createdAt",
                "address",
                "audio",
                "image",
                "priority"
            ) VALUES (
                gen_random_uuid(),
                ${title},
                ${description},
                ${latitude.toString()},
                ${longitude.toString()},
                ${nearestOffice.id},
                ${userId},
                ST_AsText(ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)),
                'UNDER_REVIEW',
                ${anonymous},
                NOW(),
                ${address},
                ${audioUrl},
                ${imageUrl},
                ${priority}
    
            )
            RETURNING 
                "id",
                "title",
                "description",
                "latitude",
                "longitude",
                "officeId",
                "userId",
                "location",
                "status",
                "dispute",
                "isAnonymous",
                "createdAt",
                "address",
                "audio",
                "image",
                "priority"
        )
        SELECT * FROM new_issue;
    `;
    
            // Fetch the created issue with relationships
            const createdIssue = await prisma.issue.findUnique({
                where: { id: issue.id },
                include: {
                    office: true,
                    user: true,
                },
            });
    
            res.status(201).json({
                success: true,
                issue: createdIssue,
            });
        } catch (error) {
            console.error("Error in createIssue:", error);
            res.status(500).json({
                success: false,
                error: "Internal server error",
                details: process.env.NODE_ENV === "development" ? error.message : undefined,
            });
        }
    };

// Function to get nearby issues within 500m radius
export const getNearbyIssues = async (req, res) => {
    const latitude = req.query.latitude;
    const longitude = req.query.longitude;
    const radius = parseInt(req.query.radius) || 1000;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 3;
    const search = req.query.search || "";

    //const d = await generateResponse("A street light has fallen down on the road.");
    //console.log(d);

    try {
        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                error: "Latitude and longitude are required",
            });
        }

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(400).json({
                success: false,
                error: "Invalid coordinates",
            });
        }

        const radiusInDegrees = radius / 111319.9;
        const offset = (page - 1) * limit;
        const searchPattern = search ? `%${search}%` : "";

        // Base query with parameterized search condition
        let baseQuery = `
            SELECT 
                i.id,
                i.title,
                i.description,
                i.latitude,
                i.longitude,
                i."officeId",
                i."userId",
                i.status,
                i.dispute,
                i."isAnonymous",
                i."createdAt",
                i."assignedToId",
                i.address,
                i.location,
                ST_Distance(
                    ST_SetSRID(ST_GeomFromText(i.location), 4326),
                    ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
                ) * 111319.9 as distance_in_meters
            FROM "Issue" i
            WHERE ST_DWithin(
                ST_SetSRID(ST_GeomFromText(i.location), 4326),
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
                ${radiusInDegrees}
            )
            AND i.status != 'RESOLVED'
        `;

        // Add search condition if search parameter exists
        if (search !== "") {
            baseQuery += ` AND (
                i.title ILIKE $1 OR 
                i.description ILIKE $1 OR 
                i.address ILIKE $1
            )`;
        }

        // Add ordering and pagination
        baseQuery += `
            ORDER BY ST_SetSRID(ST_GeomFromText(i.location), 4326) <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
            LIMIT ${limit} OFFSET ${offset}
        `;

        const nearbyIssues = await prisma.$queryRawUnsafe(baseQuery, ...(search !== "" ? [searchPattern] : []));

        const issuesWithRelations = await Promise.all(
            nearbyIssues.map(async (issue) => {
                const issueWithRelations = await prisma.issue.findUnique({
                    where: { id: issue.id },
                    include: {
                        office: true,
                        upVotes: {
                            select: {
                                id: true,
                            },
                        },
                        updates: true,
                        user: true,
                        assignedTo: true,
                        department: true,
                    },
                });

                return {
                    ...issueWithRelations,
                    distance_in_meters: Math.round(issue.distance_in_meters),
                };
            })
        );

        // Count query with parameterized search
        let countQuery = `
            SELECT COUNT(*) 
            FROM "Issue" i
            WHERE ST_DWithin(
                ST_SetSRID(ST_GeomFromText(i.location), 4326),
                ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
                ${radiusInDegrees}
            )
            AND i.status != 'RESOLVED'
        `;

        if (search) {
            countQuery += ` AND (
                i.title ILIKE $1 OR 
                i.description ILIKE $1 OR 
                i.address ILIKE $1
            )`;
        }

        const totalIssues = await prisma.$queryRawUnsafe(countQuery, ...(search !== "" ? [searchPattern] : []));
        const totalCount = parseInt(totalIssues[0].count, 10);

        res.status(200).json({
            success: true,
            issues: issuesWithRelations,
            pagination: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit),
            },
        });
    } catch (error) {
        console.error("Error in getNearbyIssues:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error",
            details: process.env.NODE_ENV === "development" ? error.message : undefined,
        });
    }
};

export const getIssueById = async (req, res) => {
    
    const issueId = req.params.id;
    try {
        const issue = await prisma.issue.findUnique({
            where: { id: issueId },
            include: {
                office: true,
                assignedTo: true,
                upVotes: true,
                updates: true,
                user: true,
            },
        });
        if (!issue) {
            return res.status(404).json({ success: false, error: "Issue not found" });
        }
        const voted = issue.upVotes.some((vote) => vote.id === req.userId);
        res.status(200).json({ success: true, issue: { ...issue, voted } });
    } catch (e) {
        console.log("Error in getIssueById ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};

export const getIssuesByOffice = async (req, res) => {
    const officeId = req.query.office;
    const page = parseInt(req.query.page) || 1;
    const userId = req.userId;
    const search = req.query.search || "";
    const LIMIT = 2;
    try {
        const user = await prisma.authority.findUnique({
            where: { id: userId },
            include: {
                office: true,
            },
        });
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        if (user.role !== "Representative authority") {
            return res.status(403).json({
                success: false,
                error: "You are not authorized to view this office",
            });
        }

        const issues = await prisma.issue.findMany({
            where: {
                officeId: user?.office.id,
                assignedTo: null,
                AND: [
                    {
                        OR: [
                            {
                                title: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                            {
                                description: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                            {
                                address: {
                                    contains: search,
                                    mode: "insensitive",
                                },
                            },
                        ],
                    },

                ],
            },
            include: {
                office: true,
                upVotes: true,
                user: true,
            },
            skip: (page - 1) * LIMIT,
            take: LIMIT,
            orderBy: {
                createdAt: "desc",
            },
        });
        const totalIssues = await prisma.issue.count({
            where: { officeId, assignedTo: null },
        });
        res.status(200).json({
            success: true,
            issues,
            pagination: {
                total: totalIssues,
                page,
                limit: LIMIT,
                totalPages: Math.ceil(totalIssues / LIMIT),
            },
        });
    } catch (e) {
        console.log("Error in getIssuesByOffice ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};

export const forwardIssue = async (req, res) => {
    const { issueId, department, role } = req.body;
    const userId = req.userId;
    try {
        const user = await prisma.authority.findUnique({
            where: { id: userId },
            include: {
                office: true,
            },
        });
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        if (user.role !== "Representative authority") {
            return res.status(403).json({
                success: false,
                error: "You are not authorized to forward this issue",
            });
        }

        if (!issueId) {
            return res.status(400).json({ success: false, error: "Issue ID is required" });
        }
        const employees = await prisma.office.findUnique({
            where: { id: user.office.id },
            include: {
                employees: true,
            },
        });
        const employee = employees?.employees.find((employee) => employee.role === role);
        if (!employee) {
            return res.status(404).json({ success: false, error: "Employee not found" });
        }
        const newUpdate = await prisma.update.create({
            data: {
                issueId: issueId,
                description: "Forwarded issue to " + department + " department",
            },
        });
        const updatedIssue = await prisma.issue.update({
            where: { id: issueId },
            data: {
                departmentOfficeId: user.office.id,
                departmentName: department,
                assignedToId: employee.id,
                status: "FORWARDED",
                updates: {
                    connect: {
                        id: newUpdate.id,
                    },
                },
                assignedToDate: new Date(),
            },
            include: {
                office: true,
                upVotes: true,
            },
        });
        res.status(200).json({ success: true, message: "Issue forwarded successfully" });
    } catch (e) {
        console.log("Error in forwardIssue ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};

export const getIssuesByAuthority = async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const userId = req.userId;
    const search = req.query.search || "";
    const LIMIT = 2;
    try {
        const issues = await prisma.issue.findMany({
            where: {
                assignedToId: userId,
                OR: [
                    {
                        title: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        description: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        address: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                ],
                
            },
            include: {
                office: true,
                upVotes: true,
            },
            skip: (page - 1) * LIMIT,
            take: LIMIT,
            orderBy: {
                createdAt: "desc",
            },
        });

        const totalIssues = await prisma.issue.count({
            where: {
                assignedToId: userId,
            },
        });
        res.status(200).json({
            success: true,
            issues,
            pagination: {
                total: totalIssues,
                page,
                limit: LIMIT,
                totalPages: Math.ceil(totalIssues / LIMIT),
            },
        });
    } catch (e) {
        console.log("Error in getIssuesByOffice ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};

export const getForwardedIssues = async (req, res) => {
    const officeId = req.query.officeId;
    const page = parseInt(req.query.page) || 1;
    const userId = req.userId;
    const search = req.query.search || "";
    const LIMIT = 2;
    try {
        const user = await prisma.authority.findUnique({
            where: { id: userId },
            include: {
                office: true,
            },
        });
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        if (user.role !== "Representative authority") {
            return res.status(403).json({
                success: false,
                error: "You are not authorized to view this office",
                isAdmin,
            });
        }

        const issues = await prisma.issue.findMany({
            where: {
                officeId: user.office.id,
                assignedToId: {
                    not: null,
                },
                OR: [
                    {
                        title: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        description: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        address: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        departmentName: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                ],
            },
            include: {
                office: true,
                assignedTo: true,
                user: {
                    select: {
                        name: true,
                    },
                },
            },
            skip: (page - 1) * LIMIT,
            take: LIMIT,
            orderBy: {
                createdAt: "desc",
            },
        });

        const totalIssues = await prisma.issue.count({
            where: {
                officeId,
                assignedToId: {
                    not: null,
                },
                OR: [
                    {
                        title: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        description: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        address: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        departmentName: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                ],
            },
        });
        res.status(200).json({
            success: true,
            issues,
            pagination: {
                total: totalIssues,
                page,
                limit: LIMIT,
                totalPages: Math.ceil(totalIssues / LIMIT),
            },
        });
    } catch (e) {
        console.log("Error in getIssuesByOffice ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};


//Issue Updation



export const updateIssue = async (req, res) => {
    const { issueId, description, status } = req.body;
    try {
        const update = await prisma.update.create({
            data: {
                issueId,
                description,
            },
        });

        const issue = await prisma.issue.findUnique({
            where: {
                id: issueId,
            },
        });
        let notification = null;
        if (status === "RESOLVED") {
            notification = await prisma.notification.create({
                data: {
                    issueId,
                    title: `Issue ${issue.title} has been resolved`,
                    description: `Issue with title ${issue.title} at ${issue.address} raised on ${issue.createdAt} has been resolved successfully`,
                    userId: issue.userId,
                },
            });
            const user = await prisma.citizen.update({
                where: {
                    id: issue.userId,
                },
                data: {
                    Notifications: {
                        connect: {
                            id: notification.id,
                        },
                    },
                },
            });
        }
        const newIssue = await prisma.issue.update({
            where: {
                id: issueId,
            },
            data: {
                updates: {
                    connect: {
                        id: update.id,
                    },
                },
                status,
                ...(notification && {
                    Notifications: {
                        connect: {
                            id: notification.id,
                        },
                    },
                }),
                ...(notification && {
                    resolvedDate: notification.createdAt,
                }),
            },
        });

        const user = await prisma.citizen.findUnique({
            where: {
                id: issue.userId,
            },
        });

        sendNotification(
            user.phone,
            `Issue with title ${issue.title} at ${issue.address} raised on ${issue.createdAt} has been ${status} successfully`
        );

        res.status(200).json({ success: true, newIssue });
    } catch (e) {
        console.log("Error in updatingIssue ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};

export const confirmResolution = async (req, res) => {
    const { issueId } = req.body;
    const { id } = req.body;
    const userId = req.userId;
    try {
        const issue = await prisma.issue.findUnique({
            where: {
                id: issueId,
            },
        });
        if (!issue) {
            return res.status(404).json({ success: false, error: "Issue not found" });
        }
        if (issue.userId !== userId) {
            return res.status(401).json({
                success: false,
                error: "You are not authorized to confirm resolution of this issue",
            });
        }
        const newIssue = await prisma.issue.update({
            where: {
                id: issueId,
            },
            data: {
                ResolutionConfirmation: true,
            },
        });
        const notification = await prisma.notification.delete({
            where: {
                id: id,
            },
        });
        res.status(200).json({ success: true, newIssue });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
};
export const rejectResolution = async (req, res) => {
    const { issueId } = req.body;
    const { id } = req.body;
    const userId = req.userId;
    try {
        const issue = await prisma.issue.findUnique({
            where: {
                id: issueId,
            },
        });
        if (!issue) {
            return res.status(404).json({ success: false, error: "Issue not found" });
        }
        if (issue.userId !== userId) {
            return res.status(401).json({
                success: false,
                error: "You are not authorized to reject resolution of this issue",
            });
        }
        const newIssue = await prisma.issue.update({
            where: {
                id: issueId,
            },
            data: {
                dispute: true,
                disputeMessage: "Issue has been rejected by the user",
                conflictResolvedDate: new Date(),
            },
        });
        const notification = await prisma.notification.delete({
            where: {
                id: id,
            },
        });
        res.status(200).json({ success: true, newIssue });
    } catch (e) {
        console.log("Error in rejectResolution ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};

const colors = {
    primary: "#1a56db", // Deep blue
    secondary: "#4b5563", // Gray
    success: "#059669", // Green
    warning: "#d97706", // Orange
    danger: "#dc2626", // Red
    text: "#111827", // Dark gray
    light: "#f3f4f6", // Light gray
    border: "#e5e7eb", // Border gray
};

// Enhanced section title with consistent spacing
function addSectionTitle(doc, text) {
    doc.moveDown(1).fontSize(16).fillColor(colors.primary).font("Helvetica-Bold").text(text).moveDown(0.5);

    // Add subtle underline
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor(colors.border).stroke().moveDown(0.5);
}

// Enhanced field with better spacing and alignment
function addField(doc, label, value, options = {}) {
    const defaultOptions = {
        labelWidth: 150,
        spacing: 0.4,
        indent: 10,
    };
    const opts = { ...defaultOptions, ...options };

    doc.x = 50 + opts.indent;

    doc.fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(colors.secondary)
        .text(label, { continued: true, width: opts.labelWidth });

    doc.font("Helvetica").fillColor(colors.text).text(`: ${value}`).moveDown(opts.spacing);
}

export const report = async (req, res) => {
    try {
        const { issueId } = req.params;

        // Fetch data (same as before)
        const issue = await prisma.issue.findUnique({
            where: { id: issueId },
            include: {
                user: {
                    select: {
                        name: true,
                        phone: true,
                    },
                },
                assignedTo: {
                    select: {
                        name: true,
                        role: true,
                        departmentName: true,
                    },
                },
                office: {
                    select: {
                        name: true,
                        location: true,
                    },
                },
                department: {
                    select: {
                        name: true,
                    },
                },
                updates: {
                    orderBy: {
                        createdAt: "asc",
                    },
                },
                upVotes: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        if (!issue) {
            return res.status(404).json({ error: "Issue not found" });
        }

        // Create PDF with better margins
        const doc = new PDFDocument({
            margins: {
                top: 40,
                bottom: 40,
                left: 40,
                right: 40,
            },
            bufferPages: true, // Enable page buffering for footer
        });

        // Set headers (same as before)
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=issue-report-${issueId}.pdf`);
        doc.pipe(res);

        // Add header with improved styling
        doc.fontSize(24)
            .font("Helvetica-Bold")
            .fillColor(colors.primary)
            .text("ISSUE REPORT", { align: "center" })
            .fontSize(12)
            .font("Helvetica")
            .fillColor(colors.secondary)
            .text(`Report ID: ${issueId}`, { align: "center" })
            .moveDown(1);

        // Basic Information Section
        addSectionTitle(doc, "Basic Information");
        addField(doc, "Title", issue.title);
        addField(doc, "Created", issue.createdAt.toLocaleString());
        addField(doc, "Location", issue.location);
        addField(doc, "Address", issue.address);
        addField(doc, "Status", issue.status);

        // Description Section with improved formatting
        addSectionTitle(doc, "Description");
        doc.fontSize(10).font("Helvetica").fillColor(colors.text).text(issue.description, {
            width: 480,
            align: "justify",
        });

        // Reporter Information (if not anonymous)
        if (!issue.isAnonymous) {
            addSectionTitle(doc, "Reported By");
            addField(doc, "Name", issue.user.name);
            addField(doc, "Contact", issue.user.phone);
        }

        // Assignment Information with improved styling
        if (issue.assignedTo) {
            addSectionTitle(doc, "Assignment Information");
            addField(doc, "Assigned To", issue.assignedTo.name);
            addField(doc, "Role", issue.assignedTo.role);
            addField(doc, "Department", issue.assignedTo.departmentName);
            addField(doc, "Assigned Date", issue.assignedToDate?.toLocaleString() || "N/A");
        }

        // Timeline with improved visual hierarchy
        if (issue.updates.length > 0) {
            addSectionTitle(doc, "Timeline of Updates");

            issue.updates.forEach((update, index) => {
                const timelineX = 60;
                const contentX = 90;
                const contentWidth = 440;

                // Timeline dot
                doc.circle(timelineX, doc.y + 10, 3).fillAndStroke(colors.primary);

                // Vertical line
                if (index < issue.updates.length - 1) {
                    doc.moveTo(timelineX, doc.y + 13)
                        .lineTo(timelineX, doc.y + 40)
                        .strokeColor(colors.border)
                        .stroke();
                }

                // Update content with better formatting
                doc.fontSize(9)
                    .font("Helvetica-Bold")
                    .fillColor(colors.secondary)
                    .text(update.createdAt.toLocaleString(), contentX, doc.y)
                    .font("Helvetica")
                    .fillColor(colors.text)
                    .text(update.description, contentX, doc.y, {
                        width: contentWidth,
                        align: "justify",
                    })
                    .moveDown(1);
            });
        }

        // Support Information with improved layout
        addSectionTitle(doc, "Community Support");
        addField(doc, "Number of Upvotes", issue.upVotes.length.toString());
        if (issue.upVotes.length > 0) {
            addField(doc, "Supported By", issue.upVotes.map((v) => v.name).join(", "));
        }

        // Dispute Information with warning styling
        if (issue.dispute) {
            addSectionTitle(doc, "Dispute Information");
            addField(doc, "Dispute Message", issue.disputeMessage || "No message provided");
        }

        doc.fontSize(8)
            .fillColor(colors.secondary)
            .text(`Generated on ${new Date().toLocaleString()}`, { align: "center" });

        // Add footer to all pages
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);

            // Add page number
            doc.fontSize(8)
                .fillColor(colors.secondary)
                .text(`Page ${i + 1} of ${pages.count}`, 0, doc.page.height - 50, {
                    align: "center",
                });
        }

        // Finalize PDF
        doc.end();
    } catch (error) {
        console.error("Error generating report:", error);
        res.status(500).json({ error: "Failed to generate report" });
    }
};

export const getConflictIssues = async (req, res) => {
    const officeId = req.query.officeId;
    const page = parseInt(req.query.page) || 1;
    const userId = req.userId;
    const search = req.query.search || "";
    const LIMIT = 2;
    try {
        const user = await prisma.authority.findUnique({
            where: { id: userId },
            include: {
                office: true,
            },
        });
        
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        if (user.role !== "Representative authority") {
            return res.status(403).json({
                success: false,
                error: "You are not authorized to view this office",
                isAdmin,
            });
        }

        const issues = await prisma.issue.findMany({
            where: {
                officeId: user.office.id,
                dispute: true,
                OR: [
                    {
                        title: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        description: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        address: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        departmentName: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                ],
            },
            include: {
                office: true,
                assignedTo: true,
                user: {
                    select: {
                        name: true,
                    },
                },
            },
            skip: (page - 1) * LIMIT,
            take: LIMIT,
            orderBy: {
                createdAt: "desc",
            },
        });

        const totalIssues = await prisma.issue.count({
            where: {
                officeId,
                dispute: true,
                OR: [
                    {
                        title: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        description: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        address: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    {
                        departmentName: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                ],
            },
        });
        res.status(200).json({
            success: true,
            issues,
            pagination: {
                total: totalIssues,
                page,
                limit: LIMIT,
                totalPages: Math.ceil(totalIssues / LIMIT),
            },

    
        });
    } catch (e) {
        console.log("Error in getIssuesByOffice ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};

const statuses = ["PENDING", "UNDER_REVIEW", "FORWARDED", "RESOLVED", "IN_PROGRESS"];

export const getAnalytics = async (req, res) => {
    const userId = req.userId;
    let fromDate = req.query.fromDate;
    let toDate = req.query.toDate;
    let type = req.query.type;
  
    if (!fromDate || fromDate == "null")
        fromDate = new Date(new Date().setDate(new Date().getDate() - 7)).toISOString();
    if (!toDate || toDate == "null") toDate = new Date().toISOString();

    try {
        if(type == "Representative authority"){
            const user = await prisma.authority.findUnique({
                where: { id: userId },
                include: {
                    office: true,
                },
            });
            if (!user) {
                return res.status(404).json({ success: false, error: "User not found" });
            }
            if (user.role !== "Representative authority") {
                return res.status(403).json({
                    success: false,
                    error: "You are not authorized to view this office",
                });
            }
            const analytics = [];
    
            const byStatus = [];
            for (let i = 0; i < statuses.length; i++) {
                const status = statuses[i];
                const issues = await prisma.issue.count({
                    where: {
                        officeId: user.office.id,
                        status: status,
                        createdAt: {
                            gte: new Date(fromDate),
                            lte: new Date(toDate),
                        },
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                });
                byStatus.push({
                    status: status,
                    count: issues,
                });
            }
    
            const Issues = await prisma.issue.findMany({
                where: {
                    officeId: user.office.id,
                    createdAt: {
                        gte: new Date(fromDate),
                        lte: new Date(toDate),
                    },
                },
                select: {
                    id : true,
                    location: true,
                    latitude: true,
                    longitude: true,
                    upVotes: true,
                    dispute: true,
                    disputeMessage: true,
                    departmentName: true,
                    resolvedDate : true,
                    status: true,
                    title: true,
                    updates: {
                        select: {
                            id: true,
                        },
                    },
                    upVotes: {
                        select: {
                            id: true,
                        },
                    },
                },
            });
    
            res.status(200).json({ success: true, analytics, byStatus, Issues });
        }else{
            const user = await prisma.authority.findUnique({
                where: { id: userId },
                include: {
                    assignedIssues: {
                        include : {
                            updates : true
                        }
                    }
                },
            });

            if (!user) {
                return res.status(404).json({ success: false, error: "User not found" });
            }

            res.status(200).json({ success: true, issues : user.assignedIssues });
        }
    } catch (e) {
        console.log("Error in getAnalytics ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};

export const upVote = async (req, res) => {
    const userId = req.userId;
    const { issueId } = req.body;
    try {
        const issue = await prisma.issue.findUnique({
            where: { id: issueId },
            include: {
                upVotes: true,
            },
        });
        if (!issue) {
            return res.status(404).json({ success: false, error: "Issue not found" });
        }

        if (issue.upVotes.find((upVote) => upVote.id === userId)) {
            return res.status(400).json({ success: false, error: "You have already upvoted this issue" });
        }

        await prisma.issue.update({
            where: { id: issueId },
            data: {
                upVotes: {
                    connect: {
                        id: userId,
                    },
                },
            },
        });

        res.status(200).json({ success: true, message: "Upvoted successfully" });
    } catch (e) {
        console.log("Error in upVote ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};
export const unupVote = async (req, res) => {
    const userId = req.userId;
    const { issueId } = req.body;
    try {
        const issue = await prisma.issue.findUnique({
            where: { id: issueId },
            include: {
                upVotes: true,
            },
        });
        if (!issue) {
            return res.status(404).json({ success: false, error: "Issue not found" });
        }

        if (!issue.upVotes.find((upVote) => upVote.id === userId)) {
            return res.status(400).json({ success: false, error: "You have not upvoted this issue" });
        }

        await prisma.issue.update({
            where: { id: issueId },
            data: {
                upVotes: {
                    disconnect: {
                        id: userId,
                    },
                },
            },
        });

        res.status(200).json({ success: true, message: "Upvoted successfully" });
    } catch (e) {
        console.log("Error in upVote ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};

// Report generation endpoint
export const monthlyReport = async (req, res) => {
    try {
        // Get current date and calculate date ranges
        const now = new Date();
        const fromDate = new Date(req.query.fromDate);
        const toDate = new Date(req.query.toDate);
        if(!fromDate || !toDate) {
            
            fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            toDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        const userId = req.userId;
        const user = await prisma.authority.findUnique({
            where: { id: userId },
            include: {
                office: true,
            },
        });
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        if(user.role !== 'Representative authority'){
            return res.status(401).json({ success: false, error: "You are not authorized to access this resource" });
        }

        // Fetch weekly issues
        const weeklyIssues = await prisma.issue.findMany({
            where: {
                createdAt: {
                    gte: fromDate,
                    lte: toDate,
                },
                office: {
                    id: user.officeId,
                }
            },
            include: {
                department: true,
                office: true,
                assignedTo: true,
                user: {
                    select: {
                        name: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        // Fetch monthly issues
        const monthlyIssues = await prisma.issue.findMany({
            where: {
                createdAt: {
                    gte: fromDate,
                    lte: toDate,
                },
                office: {
                    id: user.officeId,
                }
            },
            include: {
                department: true,
                office: true,
                assignedTo: true,
                user: {
                    select: {
                        name: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        // Calculate statistics
        const getStatusStats = (issues) => ({
            total: issues.length,
            pending: issues.filter((i) => i.status === "PENDING").length,
            inProgress: issues.filter((i) => i.status === "IN_PROGRESS").length,
            forwarded: issues.filter((i) => i.status === "FORWARDED").length,
            underReview: issues.filter((i) => i.status === "UNDER_REVIEW").length,
            resolved: issues.filter((i) => i.status === "RESOLVED").length,
            disputed: issues.filter((i) => i.dispute).length,
        });

        const weeklyStats = getStatusStats(weeklyIssues);
        const monthlyStats = getStatusStats(monthlyIssues);

        // Calculate department-wise distribution
        const getDepartmentStats = (issues) => {
            const deptStats = {};
            issues.forEach((issue) => {
                const deptName = issue.department?.name || "Unassigned";
                deptStats[deptName] = (deptStats[deptName] || 0) + 1;
            });
            return deptStats;
        };

        const weeklyDeptStats = getDepartmentStats(weeklyIssues);
        const monthlyDeptStats = getDepartmentStats(monthlyIssues);

        // Generate PDF
        const doc = new PDFDocument();
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=issue-report-${now.toISOString().split("T")[0]}.pdf`
        );
        doc.pipe(res);

        // Add title and header
        doc.fontSize(24).text("Issues Report", { align: "center" }).moveDown();

        doc.fontSize(12).text(`Generated on: ${now.toLocaleDateString()}`, { align: "right" }).moveDown(2);

        // Weekly Statistics Section
        doc.fontSize(18).text("Weekly Statistics (Last 7 Days)", { underline: true }).moveDown();

        doc.fontSize(12);
        Object.entries(weeklyStats).forEach(([key, value]) => {
            doc.text(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`);
        });
        doc.moveDown();

        // Weekly Department Distribution
        doc.fontSize(14).text("Department-wise Distribution (Weekly)", { underline: true }).moveDown();

        doc.fontSize(12);
        Object.entries(weeklyDeptStats).forEach(([dept, count]) => {
            doc.text(`${dept}: ${count} issues`);
        });
        doc.moveDown(2);

        // Monthly Statistics Section
        doc.fontSize(18).text("Monthly Statistics (Last 30 Days)", { underline: true }).moveDown();

        doc.fontSize(12);
        Object.entries(monthlyStats).forEach(([key, value]) => {
            doc.text(`${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`);
        });
        doc.moveDown();

        // Monthly Department Distribution
        doc.fontSize(14).text("Department-wise Distribution (Monthly)", { underline: true }).moveDown();

        doc.fontSize(12);
        Object.entries(monthlyDeptStats).forEach(([dept, count]) => {
            doc.text(`${dept}: ${count} issues`);
        });
        doc.moveDown(2);

        // Recent Issues List
        doc.fontSize(18).text("Recent Issues (Last 7 Days)", { underline: true }).moveDown();

        weeklyIssues.slice(0, 10).forEach((issue, index) => {
            doc.fontSize(12).text(`${index + 1}. ${issue.title}`, { underline: true });

            doc.fontSize(10)
                .text(`Status: ${issue.status}`)
                .text(`Department: ${issue.department?.name || "Unassigned"}`)
                .text(`Location: ${issue.location}`)
                .text(`Created: ${issue.createdAt.toLocaleDateString()}`)
                .text(`Reported by: ${issue.isAnonymous ? "Anonymous" : issue.user.name}`)
                .moveDown();
        });

        // Add performance metrics
        doc.addPage().fontSize(18).text("Performance Metrics", { underline: true }).moveDown();

        const avgResolutionTime = calculateAverageResolutionTime(weeklyIssues);
        const responseRates = calculateResponseRates(weeklyIssues);

        doc.fontSize(12)
            .text(`Average Resolution Time: ${avgResolutionTime} days`)
            .text(`Response Rate: ${responseRates.responseRate}%`)
            .text(`Resolution Rate: ${responseRates.resolutionRate}%`)
            .moveDown(2);

        doc.end();
    } catch (error) {
        console.error("Error generating report:", error);
        res.status(500).json({
            error: "Failed to generate report",
            details: error.message,
        });
    }
};

// Helper function to calculate average resolution time
function calculateAverageResolutionTime(issues) {
    const resolvedIssues = issues.filter((issue) => issue.status === "RESOLVED" && issue.resolvedDate);

    if (resolvedIssues.length === 0) return 0;

    const totalTime = resolvedIssues.reduce((sum, issue) => {
        const resolveTime = new Date(issue.resolvedDate) - new Date(issue.createdAt);
        return sum + resolveTime;
    }, 0);

    return Math.round((totalTime / (resolvedIssues.length * 24 * 60 * 60 * 1000)) * 10) / 10;
}

// Helper function to calculate response rates
function calculateResponseRates(issues) {
    const total = issues.length;
    if (total === 0) return { responseRate: 0, resolutionRate: 0 };

    const responded = issues.filter((issue) => issue.status !== "PENDING").length;

    const resolved = issues.filter((issue) => issue.status === "RESOLVED").length;

    return {
        responseRate: Math.round((responded / total) * 100),
        resolutionRate: Math.round((resolved / total) * 100),
    };
}

export const citizenFault = async (req,res) => {
    const { issueId } = req.params;
    const userId = req.userId;
    try {
        const user = await prisma.authority.findUnique({
            where: {
                id: userId,
            },
        });
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        if(user.role !== "Representative authority") {
            return res.status(403).json({ success: false, error: "You are not authorized to perform this action" });
        }
        const issue = await prisma.issue.update({
            where: {
                id: issueId,
            },
            data:{
                dispute : false,
                conflictResolvedDate : new Date(),
            },select:{
                userId : true,
            }
        });
        if (!issue) {
            return res.status(404).json({ success: false, error: "Issue not found" });
        }
        await prisma.citizen.update({
            where: {
                id: issue.userId,
            },
            data:{
                reputationPoints : {
                    decrement : 10,
                }
            },
        });
       
        res.status(200).json({ success: true });
    } catch (e) {
        console.log("Error in getIssueById ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};
export const authorityFault = async (req,res) => {
    const { issueId } = req.params;
    const userId = req.userId;
    try {
        const user = await prisma.authority.findUnique({
            where: {
                id: userId,
            },
        });
        if (!user) {
            return res.status(404).json({ success: false, error: "User not found" });
        }
        if(user.role !== "Representative authority") {
            return res.status(403).json({ success: false, error: "You are not authorized to perform this action" });
        }
        const issue = await prisma.issue.update({
            where: {
                id: issueId,
            },
            data:{
                dispute : false,
                conflictResolvedDate : new Date(),
            },select:{
                userId : true,
            }
        });
        if (!issue) {
            return res.status(404).json({ success: false, error: "Issue not found" });
        }
        res.status(200).json({ success: true });
    } catch (e) {
        console.log("Error in getIssueById ", e);
        res.status(400).json({ success: false, error: e.message });
    }
};

