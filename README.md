# Anker PowerConf C200 UI

Este projeto fornece uma interface gráfica (GUI) desenvolvida para gerenciar e configurar a webcam Anker PowerConf C200 em ambientes Linux.

## Motivação e Agradecimentos

O software oficial de controle e customização da Anker é distribuído nativamente apenas para plataformas Windows e macOS. O principal objetivo do desenvolvimento desta aplicação foi oferecer aos usuários de Linux uma experiência visual e prática equivalente à ferramenta oficial.

O backend deste software é baseado no projeto [anker-powerconf-c200-linux-tools](https://github.com/erans/anker-powerconf-c200-linux-tools), de autoria de Eran Sandler. Para complementar as funcionalidades da interface, foi realizado um processo de engenharia reversa diretamente no tráfego USB do dispositivo, mapeando instruções de entrada e saída (I/O) que ainda não estavam expostas, permitindo o suporte integral na aplicação.

## Arquitetura e Tecnologias

A aplicação foi desenhada visando performance e baixo consumo de recursos, utilizando as seguintes tecnologias:

*   **Tauri & Rust**: A fundação da aplicação desktop é gerada utilizando Tauri com o backend estruturado em Rust. Isso permite um tempo de execução enxuto e uma ponte de comunicação segura (IPC) entre a interface e o hardware.
*   **C (C11)**: A manipulação de baixo nível, como o acesso aos controles de extensão UVC e as chamadas via `ioctl` ao V4L2, é feita em código C nativo, compilado e lincado automaticamente na etapa de build do Rust através da biblioteca externa `cc`.
*   **Vanilla HTML, CSS e JavaScript**: A camada visual foi construída de forma pura, sem frameworks adicionais, garantindo um binário menor e resposta instantânea dos controles da câmera.

## Funcionalidades

*   Gerenciamento completo das resoluções de sensor (360p, 720p, 1080p, 2K).
*   Controle direcional dos ângulos do microfone (90º Direcional ou 360º Omnidirecional).
*   Ajuste de Campo de Visão (FOV) operando diretamente na lente (65º, 78º, 95º).
*   Pan, Tilt e Zoom digital com capacidade de centralização.
*   Controles manuais e automáticos de foco, exposição, balanço de branco e configurações de imagem (brilho, contraste, saturação, nitidez, gama).
*   Configurações dedicadas do fabricante Anti-Flicker e Espelhamento.

## Aviso Legal (Disclaimer)

Este é um software livre e independente de código aberto. O autor deste projeto não possui qualquer associação direta com a marca Anker Innovations Limited. A referência à Anker e ao modelo PowerConf C200 ocorre apenas para fins de identificação de compatibilidade de hardware.

Todos os logotipos e nomes de marcas mencionados são propriedades de seus respectivos donos. O trabalho de engenharia reversa das interfaces de comunicação do dispositivo foi conduzido com o único objetivo de interoperabilidade dentro do ecossistema Linux, sem intenção de cometer qualquer violação de propriedade intelectual, direitos autorais ou patentes associadas à marca oficial.
