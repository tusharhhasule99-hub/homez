import crypto from 'crypto';
import Razorpay from 'razorpay';

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is not set`);
    return value;
}

export function getRazorpayKey(): string {
    return requireEnv('RAZORPAY_KEY');
}

export function getRazorpaySecret(): string {
    return requireEnv('RAZORPAY_SECRET');
}

export function getRazorpayWebhookSecret(): string {
    return process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || getRazorpaySecret();
}

let client: Razorpay | null = null;

export function getRazorpayClient(): Razorpay {
    if (!client) {
        client = new Razorpay({
            key_id: getRazorpayKey(),
            key_secret: getRazorpaySecret(),
        });
    }
    return client;
}

export function rupeesToPaise(amount: number): number {
    return Math.round(amount * 100);
}

export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature?.trim()) return false;
    const secret = getRazorpayWebhookSecret();
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return expected === signature.trim();
}

export type RazorpayOrderResponse = {
    id: string;
    amount: number;
    currency: string;
    status: string;
    short_url?: string;
};

export type RazorpayPaymentLinkResponse = {
    id: string;
    short_url: string;
    status: string;
    amount: number;
    currency: string;
};

export async function createRazorpayOrder(opts: {
    amountPaise: number;
    receipt: string;
    notes: Record<string, string>;
}): Promise<RazorpayOrderResponse> {
    const razorpay = getRazorpayClient();
    const order = (await razorpay.orders.create({
        amount: opts.amountPaise,
        currency: 'INR',
        receipt: opts.receipt,
        notes: opts.notes,
    })) as RazorpayOrderResponse;
    return order;
}

export async function createRazorpayPaymentLink(opts: {
    amountPaise: number;
    referenceId: string;
    description: string;
    notes: Record<string, string>;
    callbackUrl?: string;
}): Promise<RazorpayPaymentLinkResponse> {
    const razorpay = getRazorpayClient();
    const payload: Record<string, unknown> = {
        amount: opts.amountPaise,
        currency: 'INR',
        accept_partial: false,
        reference_id: opts.referenceId,
        description: opts.description,
        notes: opts.notes,
        notify: { sms: false, email: false },
        reminder_enable: false,
        callback_method: 'get',
        callback_url: opts.callbackUrl || undefined,
    };
    
    const link = (await razorpay.paymentLink.create(
        payload as unknown as Parameters<Razorpay['paymentLink']['create']>[0],
    )) as unknown as RazorpayPaymentLinkResponse;
    return link;
}

export async function fetchRazorpayPaymentLink(linkId: string): Promise<RazorpayPaymentLinkResponse> {
    const razorpay = getRazorpayClient();
    return (await razorpay.paymentLink.fetch(linkId)) as RazorpayPaymentLinkResponse;
}

export async function fetchRazorpayOrder(orderId: string): Promise<RazorpayOrderResponse> {
    const razorpay = getRazorpayClient();
    return (await razorpay.orders.fetch(orderId)) as RazorpayOrderResponse;
}

export async function fetchRazorpayPaymentsForOrder(orderId: string): Promise<
    { id: string; status: string; method?: string }[]
> {
    const razorpay = getRazorpayClient();
    const result = (await razorpay.orders.fetchPayments(orderId)) as {
        items?: { id: string; status: string; method?: string }[];
    };
    return result.items ?? [];
}
