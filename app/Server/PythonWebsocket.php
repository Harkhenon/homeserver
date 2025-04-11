<?php
namespace App\Server;
use Illuminate\Support\Facades\Config;

class PythonWebsocket {

  private $url, $port, $uri, $os, $connectFile;

  public function __construct() {
    $this->setUrl(Config::get('websocket.websocket_ip'));
    $this->setPort(Config::get('websocket.websocket_port'));
    $this->setUri(Config::get('websocket.websocket_path'));
    $this->setOs(strtolower(PHP_OS));
    $this->setConnectFile(__DIR__."/PythonClient.py");
  }

  public function command($command = '') {
    exec('python '.$this->getConnectFile()
    .' '.$this->testJson()
    .' '.$this->getUrl()
    .' '.$this->getPort()
    .' '.$this->getUri()
    , $output);
    return $output;
  }

  public function _activateVenvPath() {
    $os = preg_match("/win[nt]?/", $this->getOs()) ? "windows" : "linux";
    return __DIR__."/Python/".$os."/activate";
  }

  public function _pythonCommand() {
    return preg_match("/win[nt]?/", $this->getOs()) ? "python" : "python3";
  }

  public function testJson() {
    return rawurlencode('
      {
       "id": "st6q5dh<q13qy5j13q5tbbqt65sqth1",
       "content":
         {
           "module": "domain",
           "type": "update",
           "data":
             {
               "fqdn": "isostatic.ovh",
               "server_ip": "82.64.30.170",
               "ns1": "ns1.isoweb.eu",
               "ns2": "ns2.isodev.eu",
               "zone":
                 [
                   "test IN A 82.64.30.170",
                   "test2 IN A 82.64.30.170",
                   "test3 IN A 82.64.30.170",
                   "test4 IN A 82.64.30.170"
                 ]
             }
         }
      }
    ');
  }

  /**
   * Get the value of uri
   */
  public function getUri()
  {
    return $this->uri;
  }

  /**
   * Set the value of uri
   *
   * @return  self
   */
  public function setUri($uri)
  {
    $this->uri = $uri;

    return $this;
  }

  /**
   * Get the value of port
   */
  public function getPort()
  {
    return $this->port;
  }

  /**
   * Set the value of port
   *
   * @return  self
   */
  public function setPort($port)
  {
    $this->port = $port;

    return $this;
  }

  /**
   * Get the value of url
   */
  public function getUrl()
  {
    return $this->url;
  }

  /**
   * Set the value of url
   *
   * @return  self
   */
  public function setUrl($url)
  {
    $this->url = $url;

    return $this;
  }

  /**
   * Get the value of os
   */
  public function getOs()
  {
    return $this->os;
  }

  /**
   * Set the value of os
   *
   * @return  self
   */
  public function setOs($os)
  {
    $this->os = $os;

    return $this;
  }

  /**
   * Get the value of connectFile
   */
  public function getConnectFile()
  {
    return $this->connectFile;
  }

  /**
   * Set the value of connectFile
   *
   * @return  self
   */
  public function setConnectFile($connectFile)
  {
    $this->connectFile = $connectFile;

    return $this;
  }
}
