import {Request,Response} from 'express';
import { AuthRequest } from "../middleware/AuthMiddleware";
import { KhaltiResponse, OrderData, OrderStatus, PaymentMethod, PaymentStatus, TransactionStatus, TransactionVerificationResponse } from '../types/orderTypes';
import Order from '../database/models/orderModel';
import Payment from '../database/models/paymentModel';
import OrderDetail from '../database/models/orderDetailModel';
import axios from 'axios';
import Product from '../database/models/productModel';

class ExtendedOrder extends Order{
    declare paymentId: string | null
}
class OrderController{
    async createOrder(req:AuthRequest,res:Response):Promise<void>{
        const userId = req.user?.id;
        const {phoneNumber,shippingAddress,totalAmount,paymentDetails,items}:OrderData = req.body;
        if(!phoneNumber || !shippingAddress || !totalAmount || 
            !paymentDetails || !paymentDetails.paymentMethod || items.length ==0){
                res.status(400).json({
                    message:"Please fill all the fields"
                });
                return;
        }
      
        const paymentData = await Payment.create({
            paymentMethod: paymentDetails.paymentMethod
        })
        const orderData = await Order.create({
            phoneNumber,
            shippingAddress,
            totalAmount,
            userId,
            paymentId:paymentData.id
        })

        let responseOrderData;
        for(var i=0; i<items.length;i++){
            responseOrderData = await OrderDetail.create({
            quantity: items[i].quantity,
            productId: items[i].productId,
            orderId: orderData.id
        })
    }
        if(paymentDetails.paymentMethod === PaymentMethod.Khalti ){
            //khalti integration
            const data ={
                return_url :"http://localhost:3000/success",
                cancel_url :"http://localhost:3000/cancel",
                purchase_order_id: orderData.id,
                amount:totalAmount * 100,
                website_url : "http://localhost:3000/",
                purchase_order_name: 'orderName_'+ orderData.id
            }
            const response = await axios.post("https://a.khalti.com/api/v2/epayment/initiate/",data,{
                headers:{
                    "Authorization": "Key dbae3da99710442a83d9068ff967b2ed"
                }
            })
            const KhaltiResponse:KhaltiResponse = response.data;
            paymentData.pidx = KhaltiResponse.pidx;
            paymentData.save();
            res.status(200).json({
                message: "order placed success",
                url: KhaltiResponse.payment_url
            })

        }else{
            res.status(200).json({
                message:"Order placed successfully"
            })
        }
    
        



    }
    async verifyTransaction(req:AuthRequest,res:Response):Promise<void>{
        const {pidx} = req.body
        const userId = req.user?.id
        if(!pidx){
            res.status(400).json({
                message: "pidx is required"
                })
                return
        }
        const response = await axios.post("https://a.khalti.com/api/v2/epayment/lookup/",{pidx},{
            headers:{
                "Authorization": " key dbae3da99710442a83d9068ff967b2ed"
            }
        })
        const data:TransactionVerificationResponse= response.data
        if(data.status ===TransactionStatus.Completed){
            await Payment.update({
                PaymentStatus:'paid'
            }, {
                where:{
                pidx
            }})
            res.status(200).json({
                message: "Payment verified successfully"
            })
            

        }else{
            res.status(400).json({
                message:"payment not verified"
            })
        }
    }
    //userSide
    async fetchMyOrders(req:AuthRequest,res:Response):Promise<void>{
        const userId = req.user?.id
        const orders = await Order.findAll({
            where:{
                userId
            },
            include:[
                {
                    model:Payment
                }
            ]
        })
        if(orders.length >0){
        res.status(200).json({
            message: "orders fetch successfully",
            orders
        })
    }else{
        res.status(400).json({
            message: "no orders found"
            })
    }
    }

    async fetchOrderDetails(req:AuthRequest,res:Response):Promise<void>{
        const userId= req.user?.id
        const orderId = req.params.id
        const order = await OrderDetail.findAll({
            where: {
                orderId
                },
                include:[
                    {
                        model:Product
                        }
                        ]
                        })
                        if(order.length>0){
                            res.status(200).json({
                                message: "order details fetch successfully",
                                data: order
                                })
                                }else{
                                    res.status(400).json({
                                        message: "no order found"
                                        })
                                        }

    }
    async cancelMyOrder(req:AuthRequest,res:Response):Promise<void>{
        const userId = req.user?.id
        const orderId = req.params.id
        const order:any = await Order.findAll({
            where: {
                id:orderId,
                userId
                }
            })
            if(order?.orderStatus === OrderStatus.Preparation || order?.orderStatus === OrderStatus.Ontheway){
                res.status(400).json({
                    message:"Order can't be cancelled"
                })
                return
            }else{
                await Order.update({orderStatus: OrderStatus.Cancelled},{
                    where:{
                        id:orderId 
                    }
                })
                res.status(200).json({
                    message:"Order cancelled successfully"
                    })
            }
           

    }

    //admin side

    async changeOrderStatus(req:Request,res:Response):Promise<void>{
       try {
        const orderId = req.params.id
        const orderStatus:OrderStatus = req.body.orderStatus
        console.log("*****************",orderStatus)
        if(!orderStatus){
            res.status(400).json({
                message:"order status is required"
                })
        }
         await Order.update({
            orderStatus
         },{
            where:{
                id:orderId
            }
         })
         res.status(200).json({
            message:"order status changed successfully"
         })

       } catch (error) {
        res.status(500).json({
            message:"something went wrong",
            error
        })
       }
    }

    async changePaymentStatus(req:Request,res:Response):Promise<void>{
        const orderId = req.params.id
        const paymentStatus:PaymentStatus = req.body.paymentStatus
        const order:any = await Order.findByPk(orderId)
        // const extendedOrder :ExtendedOrder = order as ExtendedOrder
        await Payment.update({
            paymentStatus
        },{
            where:{
                id: order.paymentId
            }
        })
        res.status(200).json({
            message:`payment status of OrderId ${orderId} changed successfully to ${paymentStatus}`
        })
    }

    async deleteOrder(req:Request,res:Response):Promise<void>{
        const orderId = req.params.id
        const order:any =await Order.findByPk(orderId)
        if(order){
            const paymentId = order.paymentId

            await OrderDetail.destroy({
                where:{
                    orderId
                }
            })
    
            await Payment.destroy({
                where:{
                    id: paymentId
                }
            })      
                 
        await Order.destroy({ where:{
            id:orderId
        }})
        
        res.status(200).json({
            message:"order deleted successfully"
            })
        }else{
            res.status(404).json({
                message:"order not found"
                })
        }
    }
}


export default new OrderController();