export function requireInternal(req, res, next) {
    console.log("🔍 Incoming internal header:", req.headers["x-internal-key"]);
    console.log("🔍 ENV internal key:", process.env.INTERNAL_API_KEY);
  
    if (!req.headers["x-internal-key"]) {
      return res.status(401).json({ error: "KEY_MISSING" });
    }
  
    if (req.headers["x-internal-key"] !== process.env.INTERNAL_API_KEY) {
      return res.status(401).json({ error: "KEY_NOT_MATCH" });
    }
  
    console.log("✅ INTERNAL AUTH OK");
    next();
  }