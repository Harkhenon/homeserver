import React, { useState, Suspense, useEffect } from 'react';
import {
  Card,
  Button,
  Icon,
  Header,
  Segment,
  Modal,
  Loader,
  List, 
  Label,
  ButtonGroup
} from 'semantic-ui-react';

import HSBreadcrumb from '@components/Parts/HSBreadcrumb';
import General from './General'
import NewHost from './Pages/NewHost';

import { say } from '@js/resources/i18n/I18N';
import { deepEqual } from '@js/resources/Util'
import client from '@js/axiosConfig';

import '@sass/Hosting.scss';
import { toast } from 'react-toastify';

const Hosting = () => {

  const [ domains, setDomains ] = useState()
  const [ currentDomain, setCurrentDomain ] = useState()
  const [ isEditing, setIsEditing ] = useState(false)
  const [ isCreating, setIsCreating ] = useState(false)

  const getDomains = async (current) => {
    await client.get('/api/domains')
          .then(response => {
            const domainsResponse = response.data.data
            localStorage.setItem('domains', JSON.stringify(domainsResponse));
            setDomains([...domainsResponse])
            if (current) {
              setCurrentDomain({...domainsResponse.find(e => e.id === current)})
            }
          })
  }

  const openEdit = (e) => {
    const domainId = parseInt(e.target.dataset.domainid);
    setCurrentDomain(domains.find(e => e.id === domainId));
    setIsEditing(true)
  }

  const deleteDomain = (event) => {
    const domainId = parseInt(event.target.dataset.domainid);
    const domainName = domains.find(e => e.id === domainId).fqdn;

    client.delete('/api/domains/' + domainId)
          .then(() => {
            toast.success(domainName + ' deleted successfully');
            getDomains();
          })
  }

  useEffect(() => {
    if (domains === undefined || !deepEqual(JSON.parse(localStorage.getItem('domains')), domains)) {
      getDomains()
    }
  })

  return (
      <main>
        <HSBreadcrumb />
        {currentDomain && (
            <Modal
              open={isEditing}
              onClose={() => setIsEditing(false)}
            >
              <General
                currentDomain={currentDomain}
                domains={domains}
                getDomains={getDomains}
                setDomains={setDomains}
                setCurrentDomain={setCurrentDomain}
              />
            </Modal>
        )}
        <Modal
          open={isCreating}
          onClose={() => setIsCreating(false)}
        >
          <NewHost
            domains={domains}
            getDomains={getDomains}
            setIsCreating={setIsCreating}
          />
        </Modal>
        {domains && (
          <div className="container">
            <Header as={Segment} icon inverted className="host-header">
              <Icon name="server" />
              {say('hs.host.manage', 'fr')}
              <Header.Subheader>
                See all your domains and their details
              </Header.Subheader>
            </Header>
            <Button
              className=''
              icon
              color='green'
              circular
              onClick={() => setIsCreating(true)}
            >
              <Icon name='add'/> {say('hs.host.create', 'fr')}
            </Button>
            <Card.Group itemsPerRow={4} stackable>
              <Suspense fallback={<p>{say('hs.loading', 'fr')}</p>}>
                { !domains ? <Loader /> :
                domains.map(element => (
                  <Card key={element.fqdn}>
                    <Card.Content>
                      <Card.Header>
                        <Icon name="world" />{element.fqdn}
                      </Card.Header>
                      </Card.Content>
                      <Card.Content extra>
                        <Label as={Card.Description}>
                          <Icon name="server"/>DNS servers
                        </Label>
                        <List>
                          <List.Item>
                            <Icon name="arrow right"/>{element.ns1}
                          </List.Item>
                          <List.Item>
                            <Icon name="arrow right"/>{element.ns2}
                          </List.Item>
                        </List>
                      </Card.Content>
                      <Card.Content extra>
                          {element.default !== 1 && (
                            <ButtonGroup widths={2}>
                              <Button
                                color="orange"
                                onClick={openEdit}
                                data-domainid={element.id}
                                content="Settings"
                              />
                              <Button
                                color="red"
                                onClick={deleteDomain}
                                data-domainid={element.id}
                                content="Delete"
                              />
                            </ButtonGroup>
                          ) || (
                              <React.Fragment>
                                <p>Default domain</p>
                                <p>Can't edit or delete it</p>
                              </React.Fragment>
                          )}
                      </Card.Content>
                  </Card>
              ))
            }
              </Suspense>  
              
            </Card.Group>
          </div>
        ) || <Loader active />}

      </main>
  )
}

export default Hosting