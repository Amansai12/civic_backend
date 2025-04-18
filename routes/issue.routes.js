import express from 'express';
import { authorityFault, citizenFault, confirmResolution, createIssue, forwardIssue, getAnalytics, getConflictIssues, getForwardedIssues, getIssueById, getIssuesByAuthority, getIssuesByOffice, getNearbyIssues, monthlyReport, rejectResolution, report, unupVote, updateIssue, upVote } from '../controllers/issue.controller.js';
import { verifyToken } from '../middlewares/verifyToken.js';
import { GoogleGenerativeAI } from '@google/generative-ai';


const issueRouter = express.Router();

issueRouter.post('/',verifyToken,createIssue)
issueRouter.get('/get',getNearbyIssues)
issueRouter.get('/office',verifyToken,getIssuesByOffice)
issueRouter.put('/forward',verifyToken,forwardIssue)
issueRouter.get('/authority',verifyToken,getIssuesByAuthority)
issueRouter.get('/forwarded',verifyToken,getForwardedIssues)
issueRouter.put('/update',verifyToken,updateIssue)
issueRouter.put('/confirmresolution',verifyToken,confirmResolution)
issueRouter.put('/rejectresolution',verifyToken,rejectResolution)
issueRouter.get('/:issueId/report',verifyToken,report)
issueRouter.get('/conflict',verifyToken,getConflictIssues)
issueRouter.get('/citizen-fault/:issueId',verifyToken,citizenFault)
issueRouter.get('/authority-fault/:issueId',verifyToken,authorityFault)
issueRouter.get('/analytics',verifyToken,getAnalytics)
issueRouter.put('/upvote',verifyToken,upVote)
issueRouter.put('/unupvote',verifyToken,unupVote)
issueRouter.get('/reports/download',verifyToken,monthlyReport)
issueRouter.get('/:id',verifyToken,getIssueById)

issueRouter.post('/genAi',async (req,res) => {
    const description  = req.body.description;
    const result = await generateResponse(description)

    res.json({response : result});
    
})

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



export default issueRouter;