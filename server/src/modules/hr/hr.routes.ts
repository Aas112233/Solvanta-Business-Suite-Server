import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';
import { z } from 'zod';

export const hrRoutes = Router();
hrRoutes.use(authenticate);

// -------------------------------------------------------------
// DEPARTMENTS
// -------------------------------------------------------------

const departmentSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    description: z.string().optional(),
    parentId: z.string().optional(),
});

hrRoutes.get(
    '/departments',
    requirePermission(PERMISSIONS.HR_DEPARTMENT_VIEW),
    async (req, res, next) => {
        try {
            const departments = await prisma.department.findMany({
                where: { companyId: req.user!.companyId },
                include: {
                    parent: true,
                    _count: { select: { employees: true } },
                },
                orderBy: { name: 'asc' },
            });
            sendSuccess(res, departments);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.post(
    '/departments',
    requirePermission(PERMISSIONS.HR_DEPARTMENT_CREATE),
    validate({ body: departmentSchema }),
    async (req, res, next) => {
        try {
            const data = req.body;

            const existing = await prisma.department.findUnique({
                where: {
                    companyId_code: {
                        companyId: req.user!.companyId,
                        code: data.code,
                    },
                },
            });

            if (existing) {
                throw new AppError('Department code already exists', 400);
            }

            const department = await prisma.department.create({
                data: {
                    ...data,
                    companyId: req.user!.companyId,
                },
            });

            sendSuccess(res, department, undefined, 201);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.put(
    '/departments/:id',
    requirePermission(PERMISSIONS.HR_DEPARTMENT_EDIT),
    validate({ body: departmentSchema.partial() }),
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const data = req.body;

            const existing = await prisma.department.findFirst({
                where: {
                    companyId: req.user!.companyId,
                    id: id as string,
                },
            });

            if (!existing) {
                throw new AppError('Department not found', 404);
            }

            if (data.code && data.code !== existing.code) {
                const codeCheck = await prisma.department.findUnique({
                    where: {
                        companyId_code: {
                            companyId: req.user!.companyId,
                            code: data.code,
                        },
                    },
                });

                if (codeCheck) {
                    throw new AppError('Department code already exists', 400);
                }
            }

            const department = await prisma.department.update({
                where: { id: id as string },
                data,
            });

            sendSuccess(res, department);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.delete(
    '/departments/:id',
    requirePermission(PERMISSIONS.HR_DEPARTMENT_DELETE),
    async (req, res, next) => {
        try {
            const { id } = req.params;

            const existing = await prisma.department.findFirst({
                where: {
                    companyId: req.user!.companyId,
                    id: id as string,
                },
            });

            if (!existing) {
                throw new AppError('Department not found', 404);
            }

            // check if anything attached
            const employeeCount = await prisma.employee.count({
                where: { departmentId: id as string },
            });

            if (employeeCount > 0) {
                throw new AppError('Cannot delete department with active employees', 400);
            }

            await prisma.department.delete({
                where: { id: id as string },
            });

            sendSuccess(res, { deleted: true });
        } catch (error) {
            next(error);
        }
    }
);

// -------------------------------------------------------------
// POSITIONS
// -------------------------------------------------------------

const positionSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    code: z.string().min(1, 'Code is required'),
    departmentId: z.string().optional().nullable(),
    level: z.number().int().min(1).default(1),
    reportsTo: z.string().optional().nullable(),
    minSalary: z.number().min(0).default(0),
    maxSalary: z.number().min(0).default(0),
});

hrRoutes.get(
    '/positions',
    requirePermission(PERMISSIONS.HR_POSITION_VIEW),
    async (req, res, next) => {
        try {
            const positions = await prisma.position.findMany({
                where: { companyId: req.user!.companyId },
                include: {
                    department: true,
                    _count: { select: { employees: true } },
                },
                orderBy: { title: 'asc' },
            });
            sendSuccess(res, positions);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.post(
    '/positions',
    requirePermission(PERMISSIONS.HR_POSITION_CREATE),
    validate({ body: positionSchema }),
    async (req, res, next) => {
        try {
            const data = req.body;

            const existing = await prisma.position.findUnique({
                where: {
                    companyId_code: {
                        companyId: req.user!.companyId,
                        code: data.code,
                    },
                },
            });

            if (existing) {
                throw new AppError('Position code already exists', 400);
            }

            const position = await prisma.position.create({
                data: {
                    ...data,
                    companyId: req.user!.companyId,
                },
            });

            sendSuccess(res, position, undefined, 201);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.put(
    '/positions/:id',
    requirePermission(PERMISSIONS.HR_POSITION_EDIT),
    validate({ body: positionSchema.partial() }),
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const data = req.body;

            const existing = await prisma.position.findFirst({
                where: {
                    companyId: req.user!.companyId,
                    id: id as string,
                },
            });

            if (!existing) {
                throw new AppError('Position not found', 404);
            }

            if (data.code && data.code !== existing.code) {
                const codeCheck = await prisma.position.findUnique({
                    where: {
                        companyId_code: {
                            companyId: req.user!.companyId,
                            code: data.code,
                        },
                    },
                });

                if (codeCheck) {
                    throw new AppError('Position code already exists', 400);
                }
            }

            const position = await prisma.position.update({
                where: { id: id as string },
                data,
            });

            sendSuccess(res, position);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.delete(
    '/positions/:id',
    requirePermission(PERMISSIONS.HR_POSITION_DELETE),
    async (req, res, next) => {
        try {
            const { id } = req.params;

            const existing = await prisma.position.findFirst({
                where: {
                    companyId: req.user!.companyId,
                    id: id as string,
                },
            });

            if (!existing) {
                throw new AppError('Position not found', 404);
            }

            // check if anything attached
            const employeeCount = await prisma.employee.count({
                where: { positionId: id as string },
            });

            if (employeeCount > 0) {
                throw new AppError('Cannot delete position with active employees', 400);
            }

            await prisma.position.delete({
                where: { id: id as string },
            });

            sendSuccess(res, { deleted: true });
        } catch (error) {
            next(error);
        }
    }
);

// -------------------------------------------------------------
// EMPLOYEES
// -------------------------------------------------------------

const employeeSchema = z.object({
    branchId: z.string().min(1, 'Branch is required'),
    employeeNo: z.string().min(1, 'Employee Number is required'),
    firstName: z.string().min(1, 'First Name is required'),
    lastName: z.string().min(1, 'Last Name is required'),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional().or(z.literal('')),
    dateOfBirth: z.string().datetime().optional().nullable(),
    gender: z.string().optional().nullable(),
    nationality: z.string().optional().nullable(),
    departmentId: z.string().optional().nullable(),
    positionId: z.string().optional().nullable(),
    managerId: z.string().optional().nullable(),
    hireDate: z.string().datetime(),
    probationEndDate: z.string().datetime().optional().nullable(),
    employmentType: z.string().default('FULL_TIME'),
    status: z.string().default('ACTIVE'),
    salary: z.number().min(0).default(0),
    currency: z.string().default('SAR'),
    bankName: z.string().optional().nullable(),
    bankAccount: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    emergencyContact: z.string().optional().nullable(),
    emergencyPhone: z.string().optional().nullable(),
});

hrRoutes.get(
    '/employees',
    requirePermission(PERMISSIONS.HR_EMPLOYEE_VIEW),
    async (req, res, next) => {
        try {
            const employees = await prisma.employee.findMany({
                where: { companyId: req.user!.companyId },
                include: {
                    branch: true,
                    department: true,
                    position: true,
                    manager: true,
                },
                orderBy: { firstName: 'asc' },
            });
            sendSuccess(res, employees);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.post(
    '/employees',
    requirePermission(PERMISSIONS.HR_EMPLOYEE_CREATE),
    validate({ body: employeeSchema }),
    async (req, res, next) => {
        try {
            const data = req.body;

            const existing = await prisma.employee.findUnique({
                where: {
                    companyId_employeeNo: {
                        companyId: req.user!.companyId,
                        employeeNo: data.employeeNo,
                    },
                },
            });

            if (existing) {
                throw new AppError('Employee Number already exists', 400);
            }

            const employee = await prisma.employee.create({
                data: {
                    ...data,
                    companyId: req.user!.companyId,
                },
            });

            sendSuccess(res, employee, undefined, 201);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.put(
    '/employees/:id',
    requirePermission(PERMISSIONS.HR_EMPLOYEE_EDIT),
    validate({ body: employeeSchema.partial() }),
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const data = req.body;

            const existing = await prisma.employee.findFirst({
                where: {
                    companyId: req.user!.companyId,
                    id: id as string,
                },
            });

            if (!existing) {
                throw new AppError('Employee not found', 404);
            }

            if (data.employeeNo && data.employeeNo !== existing.employeeNo) {
                const codeCheck = await prisma.employee.findUnique({
                    where: {
                        companyId_employeeNo: {
                            companyId: req.user!.companyId,
                            employeeNo: data.employeeNo,
                        },
                    },
                });

                if (codeCheck) {
                    throw new AppError('Employee Number already exists', 400);
                }
            }

            const employee = await prisma.employee.update({
                where: { id: id as string },
                data,
            });

            sendSuccess(res, employee);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.delete(
    '/employees/:id',
    requirePermission(PERMISSIONS.HR_EMPLOYEE_DELETE),
    async (req, res, next) => {
        try {
            const { id } = req.params;

            const existing = await prisma.employee.findFirst({
                where: {
                    companyId: req.user!.companyId,
                    id: id as string,
                },
            });

            if (!existing) {
                throw new AppError('Employee not found', 404);
            }

            // You might want to soft-delete by setting status = 'TERMINATED' instead,
            // but for CRUD completeness:
            await prisma.employee.delete({
                where: { id: id as string },
            });

            sendSuccess(res, { deleted: true });
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.get(
    '/employees/:id',
    requirePermission(PERMISSIONS.HR_EMPLOYEE_VIEW),
    async (req, res, next) => {
        try {
            const { id } = req.params;

            const employee = await prisma.employee.findFirst({
                where: {
                    companyId: req.user!.companyId,
                    id: id as string,
                },
                include: {
                    branch: true,
                    department: true,
                    position: true,
                    manager: true,
                    documents: true,
                },
            });

            if (!employee) {
                throw new AppError('Employee not found', 404);
            }

            sendSuccess(res, employee);
        } catch (error) {
            next(error);
        }
    }
);

// -------------------------------------------------------------
// EMPLOYEE DOCUMENTS
// -------------------------------------------------------------

const documentSchema = z.object({
    employeeId: z.string().min(1, 'Employee ID is required'),
    documentType: z.string().min(1, 'Document Type is required'),
    issueDate: z.string().optional().nullable(),
    expiryDate: z.string().optional().nullable(),
    issuingAuthority: z.string().optional().nullable(),
});

hrRoutes.get(
    '/documents/:employeeId',
    requirePermission(PERMISSIONS.HR_EMPLOYEE_VIEW),
    async (req, res, next) => {
        try {
            const { employeeId } = req.params;

            const documents = await prisma.employeeDocument.findMany({
                where: {
                    companyId: req.user!.companyId,
                    employeeId: employeeId as string,
                },
                orderBy: { createdAt: 'desc' },
            });
            sendSuccess(res, documents);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.post(
    '/documents',
    requirePermission(PERMISSIONS.HR_EMPLOYEE_EDIT),
    validate({ body: documentSchema }),
    async (req, res, next) => {
        try {
            const data = req.body;

            const document = await prisma.employeeDocument.create({
                data: {
                    ...data,
                    companyId: req.user!.companyId,
                    issueDate: data.issueDate ? new Date(data.issueDate) : null,
                    expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
                },
            });

            sendSuccess(res, document, undefined, 201);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.put(
    '/documents/:id',
    requirePermission(PERMISSIONS.HR_EMPLOYEE_EDIT),
    validate({ body: documentSchema.partial() }),
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const data = req.body;

            const existing = await prisma.employeeDocument.findFirst({
                where: {
                    companyId: req.user!.companyId,
                    id: id as string,
                },
            });

            if (!existing) {
                throw new AppError('Document not found', 404);
            }

            const updateData: any = { ...data };
            if (data.issueDate) updateData.issueDate = new Date(data.issueDate);
            if (data.expiryDate) updateData.expiryDate = new Date(data.expiryDate);

            const document = await prisma.employeeDocument.update({
                where: { id: id as string },
                data: updateData,
            });

            sendSuccess(res, document);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.delete(
    '/documents/:id',
    requirePermission(PERMISSIONS.HR_EMPLOYEE_EDIT),
    async (req, res, next) => {
        try {
            const { id } = req.params;

            const existing = await prisma.employeeDocument.findFirst({
                where: {
                    companyId: req.user!.companyId,
                    id: id as string,
                },
            });

            if (!existing) {
                throw new AppError('Document not found', 404);
            }

            await prisma.employeeDocument.delete({
                where: { id: id as string },
            });

            sendSuccess(res, { deleted: true });
        } catch (error) {
            next(error);
        }
    }
);
// -------------------------------------------------------------
// SHIFTS
// -------------------------------------------------------------

const shiftSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    startTime: z.string().min(1, 'Start Time is required'),
    endTime: z.string().min(1, 'End Time is required'),
    breakStart: z.string().optional().nullable(),
    breakEnd: z.string().optional().nullable(),
    gracePeriod: z.number().int().min(0).default(15),
    isOvernight: z.boolean().default(false),
});

hrRoutes.get(
    '/shifts',
    requirePermission(PERMISSIONS.HR_ATTENDANCE_VIEW),
    async (req, res, next) => {
        try {
            const shifts = await prisma.shift.findMany({
                where: { companyId: req.user!.companyId },
                orderBy: { startTime: 'asc' },
            });
            sendSuccess(res, shifts);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.post(
    '/shifts',
    requirePermission(PERMISSIONS.HR_ATTENDANCE_CREATE),
    validate({ body: shiftSchema }),
    async (req, res, next) => {
        try {
            const data = req.body;
            const shift = await prisma.shift.create({
                data: {
                    ...data,
                    companyId: req.user!.companyId,
                },
            });
            sendSuccess(res, shift, undefined, 201);
        } catch (error) {
            next(error);
        }
    }
);

// -------------------------------------------------------------
// ATTENDANCE
// -------------------------------------------------------------

const checkInSchema = z.object({
    employeeId: z.string().min(1, 'Employee ID is required'),
    timestamp: z.string().min(1, 'Timestamp is required'),
    method: z.string().optional().default('WEB'),
});

hrRoutes.post(
    '/attendance/check-in',
    requirePermission(PERMISSIONS.HR_ATTENDANCE_CREATE),
    validate({ body: checkInSchema }),
    async (req, res, next) => {
        try {
            const { employeeId, timestamp, method } = req.body;
            const date = new Date(timestamp);
            const startOfDay = new Date(date);
            startOfDay.setUTCHours(0, 0, 0, 0);

            let attendance = await prisma.attendance.findFirst({
                where: {
                    companyId: req.user!.companyId,
                    employeeId,
                    date: startOfDay,
                },
            });

            if (attendance && attendance.checkIn) {
                throw new AppError('Already checked in for this date', 400);
            }

            const employee = await prisma.employee.findFirst({
                where: { id: employeeId, companyId: req.user!.companyId }
            });
            
            if (!employee) throw new AppError('Employee not found', 404);

            if (!attendance) {
                attendance = await prisma.attendance.create({
                    data: {
                        companyId: req.user!.companyId,
                        branchId: employee.branchId, // get branch normally from employee
                        employeeId,
                        date: startOfDay,
                        checkIn: date,
                        checkInMethod: method,
                        status: 'PRESENT',
                    },
                });
            } else {
                attendance = await prisma.attendance.update({
                    where: { id: attendance.id },
                    data: {
                        checkIn: date,
                        checkInMethod: method,
                        status: 'PRESENT',
                    },
                });
            }

            sendSuccess(res, attendance);
        } catch (error) {
            next(error);
        }
    }
);

const checkOutSchema = z.object({
    employeeId: z.string().min(1, 'Employee ID is required'),
    timestamp: z.string().min(1, 'Timestamp is required'),
});

hrRoutes.post(
    '/attendance/check-out',
    requirePermission(PERMISSIONS.HR_ATTENDANCE_CREATE),
    validate({ body: checkOutSchema }),
    async (req, res, next) => {
        try {
            const { employeeId, timestamp } = req.body;
            const date = new Date(timestamp);
            const startOfDay = new Date(date);
            startOfDay.setUTCHours(0, 0, 0, 0);

            const attendance = await prisma.attendance.findFirst({
                where: {
                    companyId: req.user!.companyId,
                    employeeId,
                    date: startOfDay,
                },
            });

            if (!attendance || !attendance.checkIn) {
                throw new AppError('Cannot check out without checking in', 400);
            }

            const checkInTime = new Date(attendance.checkIn).getTime();
            const checkOutTime = date.getTime();
            const workHours = (checkOutTime - checkInTime) / (1000 * 60 * 60);

            const updated = await prisma.attendance.update({
                where: { id: attendance.id },
                data: {
                    checkOut: date,
                    workHours,
                },
            });

            sendSuccess(res, updated);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.get(
    '/attendance',
    requirePermission(PERMISSIONS.HR_ATTENDANCE_VIEW),
    async (req, res, next) => {
        try {
            const { employeeId, startDate, endDate } = req.query;
            const where: any = { companyId: req.user!.companyId };
            
            if (employeeId) where.employeeId = employeeId;
            if (startDate && endDate) {
                where.date = {
                    gte: new Date(startDate as string),
                    lte: new Date(endDate as string),
                };
            }

            const attendance = await prisma.attendance.findMany({
                where,
                include: { employee: { select: { firstName: true, lastName: true, employeeNo: true } } },
                orderBy: { date: 'desc' },
                take: 100,
            });

            sendSuccess(res, attendance);
        } catch (error) {
            next(error);
        }
    }
);

// -------------------------------------------------------------
// LEAVE TYPES & LEAVES
// -------------------------------------------------------------

const leaveTypeSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    code: z.string().min(1, 'Code is required'),
    paid: z.boolean().default(true),
    requiresApproval: z.boolean().default(true),
    maxDaysPerYear: z.number().int().optional().nullable(),
});

hrRoutes.get(
    '/leave-types',
    requirePermission(PERMISSIONS.HR_LEAVE_VIEW),
    async (req, res, next) => {
        try {
            const types = await prisma.leaveType.findMany({
                where: { companyId: req.user!.companyId },
            });
            sendSuccess(res, types);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.post(
    '/leave-types',
    requirePermission(PERMISSIONS.HR_LEAVE_CREATE),
    validate({ body: leaveTypeSchema }),
    async (req, res, next) => {
        try {
            const data = req.body;
            const existing = await prisma.leaveType.findUnique({
                where: {
                    companyId_code: {
                        companyId: req.user!.companyId,
                        code: data.code,
                    },
                },
            });
            if (existing) throw new AppError('Leave type code already exists', 400);

            const type = await prisma.leaveType.create({
                data: { ...data, companyId: req.user!.companyId },
            });
            sendSuccess(res, type, undefined, 201);
        } catch (error) {
            next(error);
        }
    }
);

const leaveSchema = z.object({
    employeeId: z.string().min(1, 'Employee ID is required'),
    leaveTypeId: z.string().min(1, 'Leave Type is required'),
    startDate: z.string().min(1, 'Start Date is required'),
    endDate: z.string().min(1, 'End Date is required'),
    reason: z.string().optional(),
});

hrRoutes.get(
    '/leaves',
    requirePermission(PERMISSIONS.HR_LEAVE_VIEW),
    async (req, res, next) => {
        try {
            const { status, employeeId } = req.query;
            const where: any = { companyId: req.user!.companyId };
            
            if (status) where.status = status;
            if (employeeId) where.employeeId = employeeId;

            const leaves = await prisma.leave.findMany({
                where,
                include: {
                    employee: { select: { firstName: true, lastName: true, employeeNo: true } },
                    leaveType: true,
                    approvedBy: { select: { name: true } }
                },
                orderBy: { appliedDate: 'desc' },
            });
            sendSuccess(res, leaves);
        } catch (error) {
            next(error);
        }
    }
);

hrRoutes.post(
    '/leaves',
    requirePermission(PERMISSIONS.HR_LEAVE_CREATE),
    validate({ body: leaveSchema }),
    async (req, res, next) => {
        try {
            const data = req.body;
            const start = new Date(data.startDate);
            const end = new Date(data.endDate);
            const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;

            const leave = await prisma.leave.create({
                data: {
                    companyId: req.user!.companyId,
                    employeeId: data.employeeId,
                    leaveTypeId: data.leaveTypeId,
                    startDate: start,
                    endDate: end,
                    days,
                    reason: data.reason,
                    status: 'PENDING',
                },
            });

            sendSuccess(res, leave, undefined, 201);
        } catch (error) {
            next(error);
        }
    }
);

const leaveStatusSchema = z.object({
    status: z.enum(['APPROVED', 'REJECTED', 'CANCELLED']),
    rejectionReason: z.string().optional(),
});

hrRoutes.patch(
    '/leaves/:id/status',
    requirePermission(PERMISSIONS.HR_LEAVE_APPROVE),
    validate({ body: leaveStatusSchema }),
    async (req, res, next) => {
        try {
            const { id } = req.params;
            const { status, rejectionReason } = req.body;

            const leave = await prisma.leave.findFirst({
                where: { id: id as string, companyId: req.user!.companyId },
            });

            if (!leave) throw new AppError('Leave record not found', 404);

            const updated = await prisma.leave.update({
                where: { id: id as string },
                data: {
                    status,
                    rejectionReason,
                    approvedById: status === 'APPROVED' ? req.user!.id : undefined,
                    approvedDate: status === 'APPROVED' ? new Date() : undefined,
                },
            });

            sendSuccess(res, updated);
        } catch (error) {
            next(error);
        }
    }
);
