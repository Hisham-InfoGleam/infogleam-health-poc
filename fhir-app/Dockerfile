FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application source
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('http'); const req=http.get('http://127.0.0.1:3000/health', (r)=>process.exit(r.statusCode===200?0:1)); req.on('error',()=>process.exit(1));"

# Start application
CMD ["node", "src/index.js"]
