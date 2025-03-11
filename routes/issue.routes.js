import express from 'express';
import { authorityFault, citizenFault, confirmResolution, createIssue, forwardIssue, getAnalytics, getConflictIssues, getForwardedIssues, getIssueById, getIssuesByAuthority, getIssuesByOffice, getNearbyIssues, monthlyReport, rejectResolution, report, unupVote, updateIssue, upVote } from '../controllers/issue.controller.js';
import { verifyToken } from '../middlewares/verifyToken.js';


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



export default issueRouter;