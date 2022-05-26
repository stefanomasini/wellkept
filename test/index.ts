'use strict';

import { expect } from 'chai';
import { DomainsBundle } from '../src/model';

describe('Serialization', () => {
    it('parse INI format', () => {
        const bundle = DomainsBundle.parseINIFormat(
            DomainsBundle.preProcessINIFormatLines(`
        [some-domain]
        VAR1=foo
        VAR2=bar

        [another-domain]
        VAR3=foo2
        VAR4=

        `)
        );
        expect(bundle.toJson()).to.deep.equal({
            v: 1,
            domains: [
                {
                    name: 'another-domain',
                    secrets: [
                        {
                            name: 'VAR3',
                            value: 'foo2',
                        },
                        {
                            name: 'VAR4',
                            value: '',
                        },
                    ],
                },
                {
                    name: 'some-domain',
                    secrets: [
                        {
                            name: 'VAR1',
                            value: 'foo',
                        },
                        {
                            name: 'VAR2',
                            value: 'bar',
                        },
                    ],
                },
            ],
        });
    });
});
