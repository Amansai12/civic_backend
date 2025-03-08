import express from 'express';

import { createOffice } from '../controllers/office.controller.js';

const officeRouter = express.Router();

officeRouter.post('/',createOffice)



export default officeRouter;