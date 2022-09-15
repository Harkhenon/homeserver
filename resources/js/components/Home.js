import React from 'react';
import { Button, Form, Icon, Input, Loader } from 'semantic-ui-react';
import { toast } from 'react-toastify';

import './scss/Home.scss';
import client from '../axiosConfig';

class Home extends React.Component {

    constructor(props) {
        super(props);
    }

    getServerInformations(
        serverCpu,
        serverRam,
        serverDisk,
        serverOs
    ) {
        client.get('api/server/informations')
        .catch((error) => {
            toast.error('Unable to reach server informations');
        })
        .then((response) => {

            const { cpuUsage, ramUsage, diskUsage, os: osUsed } = response.data;
            const { setServerInformations } = this.props;

            const cpu = document.querySelector('.machine-cpu');
            const ram = document.querySelector('.machine-ram');
            const disk = document.querySelector('.machine-disk');
            const platform = document.querySelector('#platform > h4');
            const cpuText = document.querySelector('.cpu .load');
            const ramText = document.querySelector('.ram .load');
            const diskText = document.querySelector('.disk .load');

            platform.textContent = (serverOs ??= osUsed);

            cpuText.textContent = Math.round(serverCpu ??= cpuUsage) + "%";
            ramText.textContent = Math.round(serverRam ??= ramUsage) + "%";
            diskText.textContent = Math.round(serverDisk ??= diskUsage) + "%";

            if(document.querySelector('.machine-disk .ui.loader')) {
                document.querySelector('.machine-cpu .ui.loader').remove();
                document.querySelector('.machine-ram .ui.loader').remove();
                document.querySelector('.machine-disk .ui.loader').remove();
            }
            
            const realCPU = (serverCpu ??= cpuUsage);
            const realRAM = (serverRam ??= ramUsage);
            const realDISK = (serverDisk ??= diskUsage);

            cpu.style.background = `conic-gradient(
                greenyellow ${realCPU * 3.6}deg,
                #000 ${realCPU * 3.6}deg 
            )`;
            ram.style.background = `conic-gradient(
                greenyellow ${realRAM * 3.6}deg,
                #000 ${realRAM * 3.6}deg 
            )`;
            disk.style.background = `conic-gradient(
                greenyellow ${realDISK * 3.6}deg,
                #000 ${realDISK * 3.6}deg 
            )`;
            setServerInformations(cpuUsage, ramUsage, diskUsage, osUsed);
        })
    }

    // handleDomainAvailability(e) {

    //     const { storeData, settings } = this.props;
        
    //     var options = {
    //         method: 'GET',
    //         url: 'https://whoisapi-whois-v2-v1.p.rapidapi.com/whoisserver/WhoisService',
    //         params: {
    //           domainName: e.target[0].value,
    //           apiKey: 'at_6ZoxX96RnetMR6UCvkyG6FsevqX8W',
    //           outputFormat: 'JSON',
    //           da: '1',
    //           ipwhois: '0',
    //           thinWhois: '0',
    //           _parse: '0',
    //           preferfresh: '0',
    //           checkproxydata: '0',
    //           ip: '0'
    //         },
    //         headers: {
    //           'x-rapidapi-host': 'whoisapi-whois-v2-v1.p.rapidapi.com',
    //           'x-rapidapi-key': '04d93a463amsh315b1cc4a9f9e73p112d52jsn30c8d677e5b2'
    //         }
    //       };
        
    //     storeData('settings', {
    //         ...settings,
    //         loading: true
    //     });

    //     client.request(options)
    //     .then(r => {
    //         if(r.data.WhoisRecord.domainAvailability === "AVAILABLE") {
    //             toast.success('Domain is available!')
    //             console.log(r.data)
    //         } else {
    //             toast.error("Domain isn't available for the moment...")
    //         }
    //     })
    //     .finally(() => {
    //         storeData('settings', {
    //             ...settings,
    //             loading: false
    //         });
    //     })
    // }
    
    componentDidMount() {
        const {
            serverCpu,
            serverRam,
            serverDisk,
            serverOs,
            storeData,
            settings
        } = this.props;

        if(serverCpu, serverRam, serverDisk, serverOs === null) {
            this.getServerInformations()
        }

        let intervalId = setInterval(() => {this.getServerInformations(
            serverCpu,
            serverRam,
            serverDisk,
            serverOs
        )}, 3000);

        storeData("settings", {
            ...settings,
            intervalId
        });
    };

    componentWillUnmount() {
        const { settings } = this.props;
        clearInterval(settings['intervalId']);
    }

    render() {

        const { settings } = this.props;
        return (
            <main>
                {/*<h3>Domain checker</h3>
                <Form onSubmit={this.handleDomainAvailability}>
                    <Input
                        type='text'
                        name='domain-availability'
                        placeholder='example.com'
                    />
                    <Button type="submit" loading={settings.loading}>Test</Button>
                </Form>*/}
                <div id="presentation">
                    <h3>PLATFORM</h3>
                    <div id="platform">
                        <h4>
                            <Loader
                                active
                            />
                        </h4>
                    </div>
                </div>
                <div id="main-table" className="row">
                    <div className="machine-container cpu">
                        <div className="machine-cpu circle-load">
                            <Loader
                                active
                                size="small"
                                color="green"
                            />
                        </div>
                        <div className="load"></div>
                    </div>
                    <div className="machine-container ram">
                        <div className="machine-ram circle-load">
                            <Loader
                                active
                                size="small"
                                color="green"
                            />
                        </div>
                        <div className="load"></div>
                    </div>
                    <div className="machine-container disk">
                        <div className="machine-disk circle-load">
                            <Loader
                                active
                                size="small"
                                color="green"
                            />
                        </div>
                        <div className="load"></div>
                    </div>
                </div>
            </main>
    )
    }
};

export default Home;
