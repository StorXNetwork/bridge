'use strict';

const Router = require('./index');
const inherits = require('util').inherits;
const middleware = require('storj-service-middleware');
const authenticate = middleware.authenticate;
const rawbody = middleware.rawbody;
const limiter = require('../limiter').DEFAULTS;
const errors = require('storj-service-error-types');
const log = require('../../logger');
const Analytics = require('analytics-node');

/**
 * Handles endpoints for all stripe related webhooks
 * @constructor
 * @extends {Router}
 */
function StripeRouter(options) {
    if (!(this instanceof StripeRouter)) {
        return new StripeRouter(options);
    }

    Router.apply(this, arguments);

    this._verify = authenticate(this.storage);
    this.getLimiter = middleware.rateLimiter(options.redis);
    this.analytics = new Analytics("options.config.api_keys.segment", { flushAt: 1 });
}

inherits(StripeRouter, Router);

StripeRouter.prototype._webhookInvoicePaymentSucceded = function (data, res, next) {

    const stripe = require('stripe')(data.livemode ? this.config.stripe.SK_LIVE : this.config.stripe.SK_TEST);

    // prevent test data from sending tracks to production env
    if (!data.livemode && process.env.NODE_ENV === 'production') {
        return res.status(200).send('Production Environment. This endpoint is available.');
    }
    else {
        const object = data.data.object;
        // If we have a trial do not track, it is already tracked.
        if(object.amount_paid == 0) return res.status(200).send('Trial already tracked');
        const User = this.storage.models.User;
        const email = object.customer_email;

        User.findOne({ _id: email}, (err, user) => {
            if(err || !user) {
                log.error('Webhook error no user found');
                res.status(500).send({ error: 'Cannot find user e-mail' });
            }
            else {
                const productId = object.lines.data[0].price.product;
                stripe.products.retrieve(productId, (err, product) => {
                    if(err) {
                        log.error('Webhook error retrieving product');
                        log.error('Stripe products retrieve error: ' + err);
                        res.status(500).send({ error: 'Error retrieving product' });
                    }
                    else {
                        const metadata = product.metadata;
                        // Ensure that we have defined the necessary properties for product metadata
                        if (metadata.member_tier && metadata.simple_name) {
                            res.status(200).send({ msg: 'Tracks to be sent'});
                            const amount = parseFloat(object.amount_paid / 100);
                            this.analytics.identify({
                                userId: user.uuid,
                                traits: {
                                    member_tier: metadata.member_tier,
                                    subscription_price: amount,
                                    payment_frequency: (metadata.member_tier === 'lifetime') ? undefined: object.lines.data[0].plan.interval,
                                    email: email,
                                    date: (new Date()).toISOString(),
                                    coupon: object.discount ? object.discount.coupon.name : undefined,
                                    plan: metadata.simple_name
                                }
                            }, (err) => {
                                if (err) log.error({ error: 'Identify event was not sent.', msg: err.message });
                                else {
                                    this.analytics.track({
                                        userId: user.uuid,
                                        event: (metadata.member_tier === 'lifetime') ? 'lifetime-payment' : 'subscription-renewed',
                                        properties: {
                                            email: email,
                                            price: amount,
                                            coupon: object.discount ? object.discount.coupon.name : undefined,
                                            revenue: amount,
                                            quantity: 1,
                                            plan: metadata.simple_name,
                                            currency: object.currency,
                                            date: (new Date()).toISOString(),
                                            payment_frequency: (metadata.member_tier === 'lifetime') ? undefined : object.lines.data[0].plan.interval
                                        }
                                    }, (err) => {
                                        if (err) log.error({ error: 'Track event was not sent.', msg: err.message });
                                    });
                                }
                            });
                        }
                        else {
                            log.error('Webhook error missing product metadata: member_tier and simple_name traits');
                            res.status(500).send({ error: 'Error product metadata needed' });
                        }
                    }
                });
            }
        });
    }
    return res;
};

StripeRouter.prototype._webhookCheckoutSessionCompleted = function (data, res, next) {
    const User = this.storage.models.User;

    // Prevent test data overriding real users data
    if (!data.livemode && process.env.NODE_ENV === 'production') {
        // return next(errors.InternalError(`Current environment can0t handle test data.`));
    }

    const stripe = require('stripe')(data.livemode ? this.config.stripe.SK_LIVE : this.config.stripe.SK_TEST);

    const object = data.data.object;

    const subscriptionItem = object.display_items[0];
    const customer = object.customer;
    const productId = subscriptionItem.plan.product;

    let planInfo = {
        nickname: subscriptionItem.plan.nickname,
        amount: subscriptionItem.plan.amount,
        created: subscriptionItem.plan.created,
        interval: subscriptionItem.plan.interval,
        interval_count: subscriptionItem.plan.interval_count,
        trial_period_days: subscriptionItem.plan.trial_period_days,
        renewed_count: 0,
        renewed_failed_count: 0
    };

    stripe.customers.retrieve(customer, (err, customer_obj) => {
        const email = customer_obj.email;

        log.info('Webhook called by %s', email);

        stripe.products.retrieve(productId, (err, product) => {
            if (err) {
                log.error('Webhook error retrieving product');
                log.error('Stripe products retrieve error: ' + err);
                return res.status(500).send({ error: 'Error retrieving plan' });
            }

            const metadata = product.metadata;

            User.findOne({ _id: email }, (err, user) => {
                if (err || !user) {
                    log.error('Webhook error updating user');
                    log.error('Stripe user findOne error: ' + err);
                    res.status(500).send({ error: 'Cannot find user e-mail' });
                } else {

                    const planSize = parseInt(metadata.size_bytes);
                    if (planSize === 2147483648 || planSize === 0) { planInfo.name = '2GB'; }
                    else if (planSize === 1024 * 1024 * 1024 * 3) { planInfo.name = '3GB'; }
                    else if (planSize === 21474836480) { planInfo.name = '20GB'; }
                    else if (planSize === 214748364800) { planInfo.name = '200GB'; }
                    else if (planSize === 2199023255552) { planInfo.name = '2TB'; }
                    else {
                        console.log('No matches for %s', planSize);
                    }

                    user.maxSpaceBytes = metadata.size_bytes;
                    user.isFreeTier = false;

                    user.subscriptionPlan = {
                        isSubscribed: true,
                        paymentBridge: 'stripe',
                        plan: planInfo
                    };

                    user.save(err => {
                        if (!err) {
                            log.info('Webhook success for %s', email);
                            res.status(200).send();
                        } else {
                            log.error('Webhook failed updating model for %s', email);
                            res.status(500).send({ error: 'Error saving user metadata' });
                        }
                    });

                    if (data.livemode) {
                        this.analytics.identify({
                            userId: user.uuid,
                            traits: {
                                email: email,
                                member_tier: 'trial',
                                plan: planInfo.name,
                                payment_frequency: planInfo.nickname.toLowerCase(),
                                plan_length: planInfo.interval_count + '' + planInfo.interval
                            }
                        });
                        this.analytics.track({
                            userId: user.uuid,
                            event: 'subscription-trial-start',
                            properties: {
                                email: email,
                                date: (new Date()).toISOString()
                            }
                        });
                    }
                }
            });
        });
    });
};

StripeRouter.prototype._webhookCustomerSubscriptionDeleted = function (data, res, next) {
    const User = this.storage.models.User;
    const stripe = require('stripe')(data.livemode ? this.config.stripe.SK_LIVE : this.config.stripe.SK_TEST);
    const object = data.data.object;
    const customer = object.customer;

    stripe.customers.retrieve(customer, (err, customer_obj) => {
        if (err) {
            log.error('Webhook error, customer not found on stripe', err);
            return res.status(200).send({ error: 'Unkown customer on stripe' });
        }

        const email = customer_obj.email;
        User.findOne({ _id: email }, (err, user) => {
            if (err || !user) {
                log.error('Webhook error, user %s not found on bridge database', email);
                return res.status(200).send({ error: 'Unkown customer on bridge' });
            }

            if (data.livemode) {
                this.analytics.track({
                    userId: user.uuid,
                    event: 'subscription-cancelled',
                    properties: {
                        email: email,
                        date: (new Date()).toISOString()
                    }
                });
            }

            user.maxSpaceBytes = 0;
            user.isFreeTier = true;

            user.save(err => {
                if (err) {
                    log.error('Webhook error, cannot update %s on bridge', email);
                    return res.status(500).send({ error: 'Error updating user on bridge database' });
                }

                this.analytics.identify({
                    userId: user.uuid,
                    traits: {
                        member_tier: 'free',
                        email: email
                    }
                });

                this.analytics.track({
                    event: 'subscription-deleted',
                    userId: user.uuid
                });

                return res.status(200).send();
            });
        });
    });
};

StripeRouter.prototype._webhookTeamCheckoutSessionCompleted = async function (data, res, next) {
    const stripe = require('stripe')(data.livemode ? this.config.stripe.SK_LIVE : this.config.stripe.SK_TEST);
    const User = this.storage.models.User;

    try {
        const object = data.data.object;
        const teamEmail = object.metadata.team_email;
        const customer = object.customer;
        const subscriptionItem = object.display_items[0];
        const productId = subscriptionItem.plan.product;
        const customer_obj = await stripe.customers.retrieve(customer);
        const email = customer_obj.email;
        const product = await stripe.products.retrieve(productId);
        const metadata = product.metadata;
        const account = await User.findOne({ _id: teamEmail });
        account.maxSpaceBytes = metadata.team_size_bytes;
        account.activated = true;
        account.activator = null;
        account.isFreeTier = false;
        account.save();
        log.info('[TEAMS] User %s paid for team account %s', email, teamEmail);
        res.status(200).end();
    } catch (err) {
        log.error('[TEAMS] Webhook error, reason: %s', err.message);
        res.status(500).send({ error: err.message });
    }
};

StripeRouter.prototype._webhookPaymentIntentSucceeded = async function (data, res, next) {
    const stripe = require('stripe')(data.livemode ? this.config.stripe.SK_LIVE : this.config.stripe.SK_TEST);
    const User = this.storage.models.User;
    const customer = data.data.object.customer;

    stripe.customers.retrieve(customer, (err, customer_obj) => {
        if (err || !customer_obj || !customer_obj.email) {
            return res.status(500).send({ error: 'User not found' });
        }
        const email = customer_obj.email;
        if (data.livemode) {
            User.findOne({ _id: email.toLowerCase() }, (err, user) => {
                if (user.subscriptionPlan && user.subscriptionPlan.plan && user.subscriptionPlan.plan.renewed_count) {
                    user.subscriptionPlan.plan.renewed_count++;
                    user.save();
                }
            });
        }
        res.status(200).send();
    });
};

StripeRouter.prototype._webhookPaymentIntentFailed = function (data, res, next) {
    const stripe = require('stripe')(data.livemode ? this.config.stripe.SK_LIVE : this.config.stripe.SK_TEST);
    const object = data.data.object;
    const customer = object.customer;
    stripe.customers.retrieve(customer, (err, customer_obj) => {
        if (err || !customer_obj || !customer_obj.email) {
            return res.status(500).send({ error: 'User not found' });
        }
        const User = this.storage.models.User;
        const email = customer_obj.email;
        User.findOne({ _id: email }, (err, user) => {
            if (user && user.subscriptionPlan && user.subscriptionPlan.plan) {
                if (user.subscriptionPlan.plan.renewed_failed_count) {
                    user.subscriptionPlan.plan.renewed_failed_count++;
                } else {
                    user.subscriptionPlan.plan.renewed_failed_count = 1;
                }
                user.save();
            }

            if (!err && user) {
                this.analytics.track({
                    userId: user.uuid,
                    event: 'subscription-renewal-failed',
                    properties: {
                        email: email,
                        date: (new Date()).toISOString()
                    }
                });
            }
        });
        res.status(200).send();
    });
};

StripeRouter.prototype.parseWebhook = function (req, res, next) {
    const isLiveMode = !!req.body.livemode;
    const stripe = require('stripe')(isLiveMode ? this.config.stripe.SK_LIVE : this.config.stripe.SK_TEST);

    // Verify stripe signature
    const signature = req.headers['stripe-signature'];
    let webhookObject;
    try {
        webhookObject = stripe.webhooks.constructEvent(req.rawbody, signature, isLiveMode ? this.config.stripe.SIG : this.config.stripe.SIG_TEST);
        log.info('[%s] Signed webhook from stripe recived: %s', isLiveMode ? 'LIVE' : 'TEST', webhookObject.type);
    } catch (err) {
        log.warn('[%s] Webhook vulnerability issue: Someone tried to mock on us', isLiveMode ? 'LIVE' : 'TEST');
        return res.status(500).send({ error: 'Security Error, invalid webhook source' });
    }

    log.info('STRIPE webhook: %s', webhookObject.type);

    switch (webhookObject.type) {
    case 'checkout.session.completed':
        // User completed the stripe checkout and trial period has started
        if (webhookObject.data.object.metadata.team_email) {
            return this._webhookTeamCheckoutSessionCompleted(webhookObject, res, next);
        } else {
            return this._webhookCheckoutSessionCompleted(webhookObject, res, next);
        }
    case 'customer.subscription.deleted':
        // Subscription deleted, maybe from Stripe panel
        return this._webhookCustomerSubscriptionDeleted(webhookObject, res, next);
    case 'payment_intent.succeeded':
        // Trial period finished and successful payment, or recurring successful payment
        return this._webhookPaymentIntentSucceeded(webhookObject, res, next);
    case 'invoice.payment_succeeded':
        // An invoice is paid successfully
        return this._webhookInvoicePaymentSucceded(webhookObject, res, next);
    default:
        console.warn('Unknown webhook: ', webhookObject.type);
        return next(errors.NotImplementedError(`Webhook ${webhookObject} not implemented yet`));
    }
};

StripeRouter.prototype._definitions = function () {
    return [
        ['POST', '/stripe/webhook', this.getLimiter(limiter(5000)), rawbody, this.parseWebhook]
    ];
};

module.exports = StripeRouter;