import express from 'express';
import categoryController from '../controllers/categoryController';
import AuthMiddleware, { Role } from '../middleware/AuthMiddleware';
import errorHandler from '../services/catchAsyncError';
const router = express.Router();

//post
router.route("/").post(
    AuthMiddleware.isAuthenticated,
    AuthMiddleware.restrictTo(Role.Admin) ,
    errorHandler(categoryController.addCategory))

    //get
    .get(categoryController.getCategory)

    //delete
router.route("/:id").delete(
    AuthMiddleware.isAuthenticated,
    AuthMiddleware.restrictTo(Role.Admin) ,
    errorHandler(categoryController.deleteCategory))
    
    //update
    .patch(
        AuthMiddleware.isAuthenticated,
    AuthMiddleware.restrictTo(Role.Admin) ,
        categoryController.updateCategory)

export default router