import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';

const router = Router();

const uploadDir = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

function detectAutoTag(section: string, originalName: string) {
  const name = originalName.toLowerCase();

  if (section === 'Proof of ID') {
    if (name.includes('passport')) return 'Passport';
    if (name.includes('licence') || name.includes('license')) return 'Driving Licence';
    if (name.includes('id')) return 'ID Document';
    return 'Proof of ID';
  }

  if (section === 'Proof of Address') {
    if (name.includes('utility')) return 'Utility Bill';
    if (name.includes('council')) return 'Council Tax';
    if (name.includes('bank')) return 'Bank Statement';
    if (name.includes('address')) return 'Address Evidence';
    return 'Proof of Address';
  }

  if (section === 'Proof of Income') {
    if (name.includes('payslip')) return 'Payslip';
    if (name.includes('benefit')) return 'Benefit Evidence';
    if (name.includes('bank')) return 'Bank Statement';
    if (name.includes('tax')) return 'Tax Document';
    if (name.includes('sa302')) return 'SA302';
    return 'Proof of Income';
  }

  if (name.includes('passport')) return 'Passport';
  if (name.includes('licence') || name.includes('license')) return 'Driving Licence';
  if (name.includes('payslip')) return 'Payslip';
  if (name.includes('bank')) return 'Bank Statement';

  return 'Other';
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, safeName);
  },
});

const upload = multer({ storage });

router.get('/clients/:id/documents', async (req, res) => {
  const docs = await prisma.clientDocument.findMany({
    where: { clientId: req.params.id },
    orderBy: { createdAt: 'desc' },
  });

  res.json(docs);
});

router.post('/clients/:id/documents', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const section = String(req.body.section || 'Other Documents');
  const autoTag = detectAutoTag(section, req.file.originalname);

  const doc = await prisma.clientDocument.create({
    data: {
      clientId: req.params.id,
      section,
      originalName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      filePath: req.file.path,
      autoTag,
    },
  });

  res.status(201).json(doc);
});

router.get('/clients/:clientId/documents/:documentId/download', async (req, res) => {
  const doc = await prisma.clientDocument.findFirst({
    where: {
      id: req.params.documentId,
      clientId: req.params.clientId,
    },
  });

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  return res.download(doc.filePath, doc.originalName);
});

router.delete('/clients/:clientId/documents/:documentId', async (req, res) => {
  const doc = await prisma.clientDocument.findFirst({
    where: {
      id: req.params.documentId,
      clientId: req.params.clientId,
    },
  });

  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  if (fs.existsSync(doc.filePath)) {
    fs.unlinkSync(doc.filePath);
  }

  await prisma.clientDocument.delete({
    where: { id: doc.id },
  });

  res.json({ success: true });
});

export default router;
