import { Inject, Injectable } from '@nestjs/common'
import { CommonError } from 'core/common'
import {
    ConsumeOptions,
    ConsumerConfig,
    ConsumerInfo,
    ConsumerUpdateConfig,
    ErrorCode,
    Payload,
    PubAck,
    StreamInfo,
    StreamInfoRequestOptions,
    StreamUpdateConfig,
} from 'nats'

import { NATS_CONFIG, NatsConfig } from '../nats-configs/nats-module.config'
import {
    NATS_ERROR_TITLES,
    NatsErrorsEnum,
} from '../nats-errors/nats-errors.enum'
import {
    CreateStream,
    PublishOptions,
} from '../nats-interfaces/nats.interfaces'
import { encodeMessage, parseHeaders } from '../nats-utils/nats.utils'
import { NatsConnectionService } from './nats-connection.service'

@Injectable()
export class NatsJetStreamClientService {
    constructor(
        @Inject(NATS_CONFIG)
        private readonly config: NatsConfig,
        private readonly natsConnection: NatsConnectionService,
    ) {}

    async publish<T>(
        subject: string,
        payload?: T,
        options?: PublishOptions,
    ): Promise<PubAck> {
        const js = this.natsConnection.getNatsConnection().jetstream()

        const encodedPayload: Payload = encodeMessage(payload)

        return await js.publish(subject, encodedPayload, {
            timeout: 10000,
            ...options,
            headers: parseHeaders(options?.headers),
        })
    }

    /**
     * Create or **update** stream. Set `autoupdate` flag to false, if you dont want to update stream
     */
    async createStream(options: CreateStream): Promise<StreamInfo> {
        const jsm = await this.jsm()

        try {
            return await jsm.streams.add(options)
        } catch (error) {
            // stream name already in use with a different configuration
            if (
                error?.api_error?.code === 400 &&
                error?.api_error?.err_code === 10058 &&
                options.autoupdate !== false
            ) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                return await jsm.streams.update(options.name!, options)
            }
            throw error
        }
    }

    async updateStream(
        name: string,
        options: Partial<StreamUpdateConfig>,
    ): Promise<StreamInfo> {
        const jsm = await this.jsm()

        return await jsm.streams.update(name, options)
    }

    async deleteStream(name: string): Promise<boolean> {
        const jsm = await this.jsm()

        return await jsm.streams.delete(name)
    }

    async streamInfo(
        stream: string,
        options?: Partial<StreamInfoRequestOptions>,
    ): Promise<StreamInfo> {
        const jsm = await this.jsm()

        return await jsm.streams.info(stream, options)
    }

    async consume(
        stream: string,
        consumerName?: string,
        options?: ConsumeOptions,
    ) {
        const js = this.natsConnection.getNatsConnection().jetstream()

        const consumer = await js.consumers.get(stream, consumerName)

        consumer.consume(options)
    }

    async createConsumer(
        stream: string,
        options: Partial<ConsumerConfig>,
    ): Promise<ConsumerInfo> {
        const jsm = await this.jsm()

        return await jsm.consumers.add(stream, options)
    }

    async updateConsumer(
        stream: string,
        durable: string,
        options: Partial<ConsumerUpdateConfig>,
    ): Promise<ConsumerInfo> {
        const jsm = await this.jsm()

        return await jsm.consumers.update(stream, durable, options)
    }

    async deleteConsumer(stream: string, consumer: string): Promise<boolean> {
        const jsm = await this.jsm()

        return await jsm.consumers.delete(stream, consumer)
    }

    async consumerInfo(
        stream: string,
        consumer: string,
    ): Promise<ConsumerInfo> {
        const jsm = await this.jsm()

        return await jsm.consumers.info(stream, consumer)
    }

    async jsm() {
        if (!this.config.enableJetstream) {
            throw new CommonError(
                NatsErrorsEnum.JetStreamNotEnabledConfig,
                NATS_ERROR_TITLES,
            )
        }

        try {
            const jsm = await this.natsConnection.getJetStreamManager()

            return jsm
        } catch (error) {
            if (error?.code === ErrorCode.JetStreamNotEnabled) {
                throw new CommonError(
                    NatsErrorsEnum.JetStreamNotEnabled,
                    NATS_ERROR_TITLES,
                )
            }

            throw error
        }
    }
}