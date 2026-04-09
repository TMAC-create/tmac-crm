import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();
const prisma = new PrismaClient();
async function main() {
    const email = process.env.TMAC_ADMIN_EMAIL || 'admin@tmaccrm.local';
    const password = process.env.TMAC_ADMIN_PASSWORD || 'ChangeMe123!';
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await prisma.user.upsert({
        where: { email },
        update: { name: 'TMAC Admin', passwordHash, role: Role.ADMIN, isActive: true },
        create: {
            name: 'TMAC Admin',
            email,
            passwordHash,
            role: Role.ADMIN,
            isActive: true,
        },
    });
    const existingCount = await prisma.client.count();
    if (existingCount === 0) {
        await prisma.client.createMany({
            data: [
                {
                    firstName: 'Sarah',
                    lastName: 'Thomas',
                    email: 'sarah.thomas@example.com',
                    mobile: '07111111111',
                    source: 'Website',
                    campaign: 'campaign_1',
                    status: 'NEW_LEAD',
                    assignedUserId: admin.id,
                    consentEmail: true,
                    consentPhone: true,
                },
                {
                    firstName: 'Michael',
                    lastName: 'Evans',
                    email: 'michael.evans@example.com',
                    mobile: '07222222222',
                    source: 'Introducer',
                    campaign: 'campaign_2',
                    status: 'QUALIFIED',
                    assignedUserId: admin.id,
                    consentEmail: true,
                    consentSms: true,
                },
            ],
        });
    }
    console.log(`Seed complete. Admin user: ${email}`);
}
main()
    .catch((error) => {
    console.error(error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
