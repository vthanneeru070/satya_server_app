Migrate Uploads to S3

Goal

Replace all local file storage with AWS S3-backed uploads and ensure all persisted media fields store public S3 URLs.

Scope





Replace disk-based multer upload flow with memory-based upload flow.



Upload files to S3 from controller/service layer.



Remove local /uploads static serving and local file delete logic.



Keep existing business endpoints working with S3 URLs.



Add generic upload endpoint for reusable uploads.

Implementation Plan





Add S3 service module





Create C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/services/s3Service.js with:





uploadFile(file, folder) using @aws-sdk/client-s3 PutObjectCommand



deleteFile(fileUrl) using DeleteObjectCommand



Build deterministic public URL format and guard missing AWS env config.



Standardize upload middleware





Create C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/middleware/upload.js:





multer.memoryStorage()



MIME filtering for image/*, audio/*, video/*



max file size 10MB



Replace route-level imports of legacy upload middlewares in:





C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/routes/poojaRoutes.js



C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/routes/donationRoutes.js



C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/routes/festivalRoutes.js



Migrate controllers to S3 URL persistence





Update upload points in:





C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/controllers/poojaController.js



C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/controllers/donationController.js



C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/controllers/festivalController.js



Replace local path generation (/uploads/...) with S3 URL returned by uploadFile.



Replace local deletion logic with best-effort deleteFile calls.



Add generic upload API





Add C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/routes/uploadRoutes.js:





POST /api/upload



support single/multiple files



support folder selection constrained to: donations, rituals, festivals, general



return uploaded URL(s)



Mount in C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/app.js.



Remove local storage behavior





Remove /uploads static serving from C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/app.js.



Delete obsolete middlewares:





C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/middleware/uploadPoojaImage.js



C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/middleware/uploadDonationImage.js



C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/middleware/uploadFestivalImage.js



Environment and runtime safety





Document and validate required env vars in .env.example:





AWS_ACCESS_KEY



AWS_SECRET_KEY



AWS_REGION



AWS_BUCKET_NAME



Ensure multer/type/S3 errors produce consistent API errors via C:/Users/Admin-LFI/develop/satyabackend/satya_server_app/src/middleware/errorHandler.js.

Verification Checklist





Uploading image/audio/video to pooja, donation, and festival endpoints stores S3 URLs in DB.



Replacing media removes old file from S3.



POST /api/upload uploads one or many files and returns URLs.



No code path writes to local /uploads.



App runs correctly on Render without local file dependency.

Deliverable





Save this plan as miragtions3.md.plan and execute after approval.

