const { sendSuccess } = require("../utils/response");
const { uploadFile } = require("../services/s3Service");
const productService = require("../services/productService");

/**
 * Pull a single uploaded image from a multipart request, regardless of whether
 * Multer was used in .single() or .fields() mode.
 */
const getUploadedImageBuffer = (req) => {
  if (req.file) return req.file;
  if (req.files?.image?.length) return req.files.image[0];
  return null;
};

const uploadProductImage = async (req) => {
  const file = getUploadedImageBuffer(req);
  if (!file) return null;
  return uploadFile(file, "products");
};

const isAdminRole = (req) =>
  req.user?.role === "admin" || req.user?.role === "superadmin";

const createProduct = async (req, res, next) => {
  try {
    const imageUrl = await uploadProductImage(req);
    const product = await productService.createProduct({
      body: req.body,
      imageUrl,
      userId: req.user.userId,
    });
    return sendSuccess(res, { product }, "Product created successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const imageUrl = await uploadProductImage(req);
    const product = await productService.updateProduct({
      id: req.params.id,
      body: req.body,
      imageUrl,
    });
    return sendSuccess(res, { product }, "Product updated successfully");
  } catch (error) {
    return next(error);
  }
};

const deleteProduct = async (req, res, next) => {
  try {
    const hard = String(req.query.hard || "").toLowerCase() === "true";
    const result = await productService.deleteProduct(req.params.id, { hard });
    return sendSuccess(
      res,
      result,
      hard ? "Product permanently deleted" : "Product deleted successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const restoreProduct = async (req, res, next) => {
  try {
    const product = await productService.restoreProduct(req.params.id);
    return sendSuccess(res, { product }, "Product restored successfully");
  } catch (error) {
    return next(error);
  }
};

const getProductById = async (req, res, next) => {
  try {
    const viewer = isAdminRole(req) ? "admin" : "public";
    const product = await productService.getProductById(req.params.id, { viewer });
    return sendSuccess(res, { product }, "Product fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const listProducts = async (req, res, next) => {
  try {
    // Catalogue listing is always public-facing: only `APPROVED` review status
    // and `ACTIVE` publish flag (see productService public filter), regardless of
    // whether the caller is admin/superadmin. Full catalog: GET /products/all
    // or GET /products/my.
    const result = await productService.listProducts(req.query, { viewer: "public" });
    return sendSuccess(res, result, "Products fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const listAllProducts = async (req, res, next) => {
  try {
    const result = await productService.listAllProducts(req.query);
    return sendSuccess(res, result, "All products fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const listMyProducts = async (req, res, next) => {
  try {
    const result = await productService.listMyProducts(req.user.userId, req.query);
    return sendSuccess(res, result, "My products fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const setProductStatus = async (req, res, next) => {
  try {
    const product = await productService.setProductStatus(
      req.params.id,
      req.body.productStatus
    );
    return sendSuccess(res, { product }, "Product status updated");
  } catch (error) {
    return next(error);
  }
};

const setFeatured = async (req, res, next) => {
  try {
    const product = await productService.setFeatured(req.params.id, req.body.isFeatured);
    return sendSuccess(res, { product }, "Product featured flag updated");
  } catch (error) {
    return next(error);
  }
};

const reviewProduct = async (req, res, next) => {
  try {
    const product = await productService.reviewProduct(req.params.id, req.body.status);
    return sendSuccess(res, { product }, "Product reviewed successfully");
  } catch (error) {
    return next(error);
  }
};

const getFeaturedProducts = async (req, res, next) => {
  try {
    const products = await productService.getFeaturedProducts({ limit: req.query.limit });
    return sendSuccess(res, { products }, "Featured products fetched successfully");
  } catch (error) {
    return next(error);
  }
};

const getPopularProducts = async (req, res, next) => {
  try {
    const products = await productService.getPopularProducts({ limit: req.query.limit });
    return sendSuccess(res, { products }, "Popular products fetched successfully");
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  getProductById,
  listProducts,
  listAllProducts,
  listMyProducts,
  setProductStatus,
  setFeatured,
  reviewProduct,
  getFeaturedProducts,
  getPopularProducts,
};
