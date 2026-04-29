import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketCategory = 'ai' | 'sync' | 'token' | 'account' | 'other';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';

const statuses = new Set(['open', 'pending', 'resolved', 'closed']);
const categories = new Set(['ai', 'sync', 'token', 'account', 'other']);
const priorities = new Set(['low', 'normal', 'high', 'urgent']);

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForUser(userId: string, status: string | undefined, page: number, pageSize: number) {
    const where: Prisma.TicketWhereInput = { userId };
    if (status) where.status = this.parseStatus(status);
    return this.list(where, page, pageSize);
  }

  async detailForUser(userId: string, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id, userId },
      include: this.detailInclude(),
    });
    if (!ticket) throw new ApiError(40460, 'ticket not found');
    return this.toDetail(ticket);
  }

  async create(userId: string, payload: { title?: string; category?: string; priority?: string; content?: string; attachments?: string[] }) {
    const title = payload.title?.trim();
    const content = payload.content?.trim();
    if (!title || !content) throw new ApiError(40060, 'ticket title and content are required');
    const category = this.parseCategory(payload.category ?? 'other');
    const priority = this.parsePriority(payload.priority ?? 'normal');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ApiError(40400, 'user not found');
    const now = new Date();
    const ticket = await this.prisma.ticket.create({
      data: {
        userId,
        title,
        category,
        priority,
        status: 'open',
        lastReplyAt: now,
        messages: {
          create: {
            authorId: userId,
            authorRole: 'user',
            content,
            attachments: this.cleanAttachments(payload.attachments),
            createdAt: now,
          },
        },
      },
      include: this.detailInclude(),
    });
    return this.toDetail(ticket);
  }

  async replyAsUser(userId: string, id: string, payload: { content?: string; attachments?: string[] }) {
    const ticket = await this.prisma.ticket.findFirst({ where: { id, userId } });
    if (!ticket) throw new ApiError(40460, 'ticket not found');
    if (ticket.status === 'closed') throw new ApiError(40960, 'ticket is closed');
    return this.addMessage(id, userId, 'user', payload.content, payload.attachments, ticket.status === 'pending' ? 'open' : ticket.status);
  }

  async closeForUser(userId: string, id: string) {
    const ticket = await this.prisma.ticket.findFirst({ where: { id, userId } });
    if (!ticket) throw new ApiError(40460, 'ticket not found');
    await this.prisma.ticket.update({ where: { id }, data: { status: 'closed' } });
    return null;
  }

  async listForAdmin(params: { status?: string; q?: string; page?: number; pageSize?: number }) {
    const where: Prisma.TicketWhereInput = {};
    if (params.status) where.status = this.parseStatus(params.status);
    const q = params.q?.trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { nickname: { contains: q, mode: 'insensitive' } } },
      ];
    }
    return this.list(where, params.page ?? 1, params.pageSize ?? 20, true);
  }

  async detailForAdmin(id: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id }, include: this.detailInclude() });
    if (!ticket) throw new ApiError(40460, 'ticket not found');
    return this.toDetail(ticket, true);
  }

  async replyAsAdmin(adminId: string, id: string, payload: { content?: string; attachments?: string[]; status?: string }) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new ApiError(40460, 'ticket not found');
    const nextStatus = payload.status ? this.parseStatus(payload.status) : 'pending';
    return this.addMessage(id, adminId, 'staff', payload.content, payload.attachments, nextStatus);
  }

  async updateByAdmin(id: string, payload: { status?: string; priority?: string }) {
    const data: Prisma.TicketUpdateInput = {};
    if (payload.status) data.status = this.parseStatus(payload.status);
    if (payload.priority) data.priority = this.parsePriority(payload.priority);
    const ticket = await this.prisma.ticket.update({ where: { id }, data, include: this.detailInclude() }).catch(() => null);
    if (!ticket) throw new ApiError(40460, 'ticket not found');
    return this.toDetail(ticket, true);
  }

  private async list(where: Prisma.TicketWhereInput, page: number, pageSize: number, includeUser = false) {
    const safePage = Math.max(1, Math.floor(page || 1));
    const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize || 20)));
    const [total, items] = await Promise.all([
      this.prisma.ticket.count({ where }),
      this.prisma.ticket.findMany({
        where,
        include: { messages: { orderBy: { createdAt: 'asc' } }, user: includeUser },
        orderBy: { lastReplyAt: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
    ]);
    return { total, page: safePage, pageSize: safePageSize, items: items.map((ticket) => this.toSummary(ticket, includeUser)) };
  }

  private async addMessage(ticketId: string, authorId: string, authorRole: 'user' | 'staff', content: string | undefined, attachments: string[] | undefined, nextStatus: string) {
    const text = content?.trim();
    if (!text) throw new ApiError(40061, 'reply content is required');
    const now = new Date();
    const message = await this.prisma.ticketMessage.create({
      data: { ticketId, authorId, authorRole, content: text, attachments: this.cleanAttachments(attachments), createdAt: now },
      include: { author: true },
    });
    await this.prisma.ticket.update({ where: { id: ticketId }, data: { status: nextStatus, lastReplyAt: now } });
    return this.toMessage(message);
  }

  private detailInclude() {
    return { messages: { include: { author: true }, orderBy: { createdAt: 'asc' as const } }, user: true };
  }

  private toSummary(ticket: Prisma.TicketGetPayload<{ include: { messages: true; user?: true } }>, includeUser = false) {
    const last = ticket.messages[ticket.messages.length - 1];
    return {
      id: ticket.id,
      title: ticket.title,
      category: ticket.category as TicketCategory,
      status: ticket.status as TicketStatus,
      priority: ticket.priority as TicketPriority,
      lastReplyAt: (last?.createdAt ?? ticket.lastReplyAt).toISOString(),
      createdAt: ticket.createdAt.toISOString(),
      messageCount: ticket.messages.length,
      user: includeUser && 'user' in ticket ? this.toTicketUser(ticket.user) : undefined,
    };
  }

  private toDetail(ticket: Prisma.TicketGetPayload<{ include: ReturnType<TicketsService['detailInclude']> }>, includeUser = false) {
    return {
      id: ticket.id,
      title: ticket.title,
      category: ticket.category as TicketCategory,
      status: ticket.status as TicketStatus,
      priority: ticket.priority as TicketPriority,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      lastReplyAt: ticket.lastReplyAt.toISOString(),
      user: includeUser ? this.toTicketUser(ticket.user) : undefined,
      messages: ticket.messages.map((message) => this.toMessage(message)),
    };
  }

  private toMessage(message: Prisma.TicketMessageGetPayload<{ include: { author: true } }>) {
    return {
      id: message.id,
      from: message.authorRole === 'staff' ? 'staff' : 'user',
      authorName: message.author.nickname ?? message.author.email,
      content: message.content,
      attachments: message.attachments,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private toTicketUser(user: { id: string; email: string; nickname: string | null }) {
    return { id: user.id, email: user.email, username: user.nickname ?? user.email };
  }

  private parseStatus(value: string) {
    if (!statuses.has(value)) throw new ApiError(40062, 'invalid ticket status');
    return value;
  }

  private parseCategory(value: string) {
    if (!categories.has(value)) throw new ApiError(40063, 'invalid ticket category');
    return value;
  }

  private parsePriority(value: string) {
    if (!priorities.has(value)) throw new ApiError(40064, 'invalid ticket priority');
    return value;
  }

  private cleanAttachments(value: string[] | undefined) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).slice(0, 10) : [];
  }
}
